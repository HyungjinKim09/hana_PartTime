import {ApiError} from './storage';
import {folderView,listFolders,type FolderRow} from './folders';
import {addressNodes,addressParts,matchingAddress,withinAddress} from './address-folders';
import {searchFolders} from './folder-search';
import {folderLabel,type Folder} from './types';
import type {LibraryCard,LibraryPage,LibrarySelection,LibrarySummary} from './library-types';
import {surveyParticipants,type ParticipantScope} from './survey-participants';

const join=' FROM survey_folders f LEFT JOIN folder_stats p ON p.owner=f.owner AND p.folder=f.id ';
const stats='COALESCE(p.count,0) AS count,COALESCE(p.bytes,0) AS bytes,COALESCE(p.photo_count,0) AS photo_count,COALESCE(p.photo_bytes,0) AS photo_bytes,COALESCE(p.drawing_count,0) AS drawing_count';
const fields='f.id,f.region,f.survey_date,f.lot,f.unit,f.unit_display,f.address,f.time,f.survey_status,f.group_index,f.schedule_team,f.sort_index,f.downloaded_by,f.photo_revision,f.download_photo_revision,f.download_revision';
const aggregate="COUNT(*) AS schedules,COALESCE(SUM(CASE WHEN p.count>0 THEN 1 ELSE 0 END),0) AS withPhotos,COALESCE(SUM(CASE WHEN p.photo_count>0 THEN 1 ELSE 0 END),0) AS withFieldPhotos,COALESCE(SUM(p.count),0) AS photos,COALESCE(SUM(p.bytes),0) AS bytes,COALESCE(SUM(p.photo_count),0) AS fieldPhotos,COALESCE(SUM(p.photo_bytes),0) AS fieldBytes,COALESCE(SUM(CASE WHEN f.survey_status='완료' THEN 1 ELSE 0 END),0) AS completed,COALESCE(SUM(CASE WHEN p.photo_count>0 AND f.downloaded_by IS NOT NULL AND f.photo_revision=f.download_photo_revision THEN 1 ELSE 0 END),0) AS downloaded,CASE WHEN COUNT(*)=1 THEN MAX(f.time) END AS time,CASE WHEN COUNT(*)=1 THEN MAX(f.survey_status) END AS status";
export const emptySummary=():LibrarySummary=>({schedules:0,withPhotos:0,withFieldPhotos:0,photos:0,bytes:0,fieldPhotos:0,fieldBytes:0,completed:0,downloaded:0});
export function summarize(folders:Folder[]):LibrarySummary{return {schedules:folders.length,withPhotos:folders.filter(f=>f.count>0).length,withFieldPhotos:folders.filter(f=>(f.photoCount??f.count)>0).length,photos:folders.reduce((n,f)=>n+f.count,0),bytes:folders.reduce((n,f)=>n+f.bytes,0),fieldPhotos:folders.reduce((n,f)=>n+(f.photoCount??f.count),0),fieldBytes:folders.reduce((n,f)=>n+(f.photoBytes??f.bytes),0),completed:folders.filter(f=>f.surveyStatus==='완료').length,downloaded:folders.filter(f=>f.downloadComplete&&(f.photoCount??f.count)>0).length,...(folders.length===1?{time:folders[0].time,status:folders[0].surveyStatus,downloadedBy:folders[0].downloadedBy}:{} )};}
function lightweight(row:Partial<FolderRow>):Folder{return folderView({owner:'',revision:0,manual_added:0,name:'',phones:'[]',notes:'',remarks:'',building_details:'',warning:0,unit:'',unit_display:'',...row} as FolderRow);}
function place(f:Folder){return {id:f.id,region:f.region,date:f.date,lot:f.lot,unit:f.unit,unitDisplay:f.unitDisplay,address:f.address};}
export function librarySelection(params:URLSearchParams):LibrarySelection{
 const region=params.get('region')||undefined,date=params.get('date')||undefined,folder=params.get('folder')||undefined,view=params.get('view')==='address'?'address':'date';let path:string[]=[];
 try{path=JSON.parse(params.get('path')||'[]');if(!Array.isArray(path)||path.length>4||path.some(x=>typeof x!=='string'||x.length>600))throw Error();}catch{throw new ApiError('주소 폴더 경로를 확인해 주세요.');}
 if((region&&region.length>300)||(folder&&folder.length>150)||(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date)))throw new ApiError('폴더 조회 범위를 확인해 주세요.');
 if(path.length&&(!region||view!=='address'))throw new ApiError('주소 경로에 해당하는 구역을 선택해 주세요.');
 return {region,date:view==='date'?date:undefined,folder,view,path};
}
function conditions(owner:string,scope:LibrarySelection){let where='f.owner=? AND f.deleting=0';const args:unknown[]=[owner];if(scope.region){where+=' AND f.region=?';args.push(scope.region);}if(scope.date&&scope.view==='date'){where+=' AND f.survey_date=?';args.push(scope.date);}return {where,args};}
async function candidates(db:D1Database,owner:string,scope:LibrarySelection,search=false){const {where,args}=conditions(owner,scope);const rows=await db.prepare('SELECT '+fields+(search?',f.name':'')+','+stats+join+'WHERE '+where+' ORDER BY f.survey_date DESC,f.group_index,f.sort_index,f.id').bind(...args).all<FolderRow>();const path=scope.path||[],categorized=!path.length||path[0].startsWith('category:');return rows.results.map(lightweight).filter(f=>withinAddress(f,path,categorized));}
function migrateAddressPath(scope:LibrarySelection,f?:Folder){if(f&&scope.view==='address'&&scope.path?.length&&!scope.path[0].startsWith('category:')){scope.path=[addressParts(f,true)[0].key,...scope.path];return scope.path;}return undefined;}
export async function selectedFolderIds(db:D1Database,owner:string,scope:LibrarySelection){
 if(scope.folder){const row=await db.prepare('SELECT '+fields+join+'WHERE f.owner=? AND f.id=? AND f.deleting=0').bind(owner,scope.folder).first<FolderRow>();if(!row)throw new ApiError('폴더를 찾을 수 없습니다.',404);const target=lightweight(row);return (scope.view==='address'?matchingAddress(await candidates(db,owner,{region:target.region,view:'address'}),target):[target]).map(f=>f.id);}
 const rows=await candidates(db,owner,scope);return rows.map(f=>f.id);
}
export async function libraryNavigation(db:D1Database,owner:string,region?:string){const [regions,dates]=await Promise.all([db.prepare('SELECT region FROM survey_folders WHERE owner=? AND deleting=0 GROUP BY region ORDER BY region').bind(owner).all<{region:string}>(),region?db.prepare('SELECT survey_date AS date,COUNT(*) AS schedules FROM survey_folders WHERE owner=? AND region=? AND deleting=0 GROUP BY survey_date ORDER BY survey_date DESC').bind(owner,region).all<{date:string;schedules:number}>():Promise.resolve({results:[]})]);return {regions:regions.results.map(f=>f.region),dates:dates.results};}
async function catalog(db:D1Database,owner:string,params:URLSearchParams):Promise<Omit<LibraryPage,'photos'|'nextCursor'>>{
 const scope=librarySelection(params),limit=Number(params.get('limit')||60),raw=params.get('foldersCursor')||'0',q=(params.get('q')||'').trim();
 if(!/^\d+$/.test(raw)||Number(raw)>100000||!Number.isInteger(limit)||limit<1||limit>100||q.length>150)throw new ApiError('폴더 페이지 범위를 확인해 주세요.');const offset=Number(raw);
 const base={folders:[] as Folder[],cards:[] as LibraryCard[],nextFoldersCursor:null as string|null,totalCards:0,summary:emptySummary(),pathLabels:[] as string[]};
 if(scope.folder){const target=await db.prepare('SELECT '+fields+','+stats+join+'WHERE f.owner=? AND f.id=? AND f.deleting=0').bind(owner,scope.folder).first<FolderRow>();if(!target)throw new ApiError('폴더를 찾을 수 없습니다.',404);
  const f=lightweight(target),peers=scope.view==='address'?matchingAddress(await candidates(db,owner,{region:f.region,view:'address'},true),f):[];
  const full=await listFolders(db,owner,{ids:[f.id]}),folders=[...full,...peers.filter(peer=>peer.id!==f.id)],canonicalAddressPath=migrateAddressPath(scope,f);return {...base,folders,summary:summarize(folders),canonicalAddressPath,pathLabels:scope.view==='address'?addressParts(f,true).slice(0,scope.path?.length).map(p=>p.label):[],place:place(f)};
 }
 const {where,args}=conditions(owner,scope);let cards:LibraryCard[]=[];let summary:LibrarySummary;let pathLabels:string[]=[];let firstPlace:LibraryCard['place'];let canonicalAddressPath:string[]|undefined;
 const rawTeam=params.get('team');
 if(rawTeam!==null&&(!scope.region||!scope.date||scope.view!=='date'||(rawTeam!=='first'&&(!/^\d{1,2}$/.test(rawTeam)||Number(rawTeam)>20))))throw new ApiError('조사 팀을 확인해 주세요.');
 const teams=scope.region&&scope.date&&scope.view==='date'?await db.prepare('SELECT COALESCE(f.schedule_team,0) AS team,COUNT(*) AS count FROM survey_folders f WHERE '+where+' GROUP BY f.schedule_team ORDER BY f.schedule_team IS NULL,f.schedule_team').bind(...args).all<{team:number;count:number}>():undefined;
 const teamChoices=teams?.results.some(entry=>entry.team>0)?teams.results:undefined;
 const team=rawTeam==='first'?teamChoices?.[0].team??null:rawTeam===null?null:Number(rawTeam);
 if(q||scope.view==='address'&&scope.region){const all=await candidates(db,owner,scope,!!q);const rows=team===null?all:all.filter(f=>(f.team??0)===team);canonicalAddressPath=migrateAddressPath(scope,rows[0]);summary=summarize(rows);firstPlace=rows[0]?place(rows[0]):undefined;pathLabels=rows[0]?addressParts(rows[0],true).slice(0,scope.path?.length).map(p=>p.label):[];
  if(q){cards=searchFolders(rows,q,scope.view,scope.path).map(g=>({key:JSON.stringify([g.folder.region,g.folder.date,g.path]),label:g.label,leaf:g.leaf,target:{region:g.folder.region,date:scope.view==='date'?g.folder.date:undefined,view:scope.view,folder:g.leaf?g.folder.id:undefined,path:scope.view==='address'?g.path:[]},summary:summarize(g.folders),children:g.leaf?0:addressNodes(g.folders,g.path,true).length,unitCount:g.unitCount,place:place(g.folder)}));}
  else cards=addressNodes(rows,scope.path||[],true).map(n=>({key:n.key,label:n.label,leaf:n.leaf,target:{region:scope.region,view:'address',path:[...(scope.path||[]),n.key],folder:n.leaf?n.folders[0].id:undefined},summary:summarize(n.folders),children:n.leaf?0:addressNodes(n.folders,[...(scope.path||[]),n.key],true).length,place:place(n.folders[0])}));
 }else if(scope.region&&scope.date){summary=(await db.prepare('SELECT '+aggregate+join+'WHERE '+where).bind(...args).first<LibrarySummary>())!;
  const teamFilter=team===null?'':team===0?' AND f.schedule_team IS NULL':' AND f.schedule_team=?';
  const rows=await db.prepare('SELECT '+fields+','+stats+join+'WHERE '+where+teamFilter+' ORDER BY f.group_index,f.sort_index,f.lot,f.id LIMIT ? OFFSET ?').bind(...args,...(team? [team]:[]),limit+1,offset).all<FolderRow>();
  cards=rows.results.slice(0,limit).map(lightweight).map(f=>({key:f.id,label:folderLabel(f),leaf:true,target:{region:f.region,date:f.date,view:'date',folder:f.id},summary:summarize([f]),children:0,place:place(f)}));return {...base,summary,cards,teams:teamChoices,totalCards:team===null?summary.schedules:teams?.results.find(entry=>entry.team===team)?.count??0,nextFoldersCursor:rows.results.length>limit?String(offset+limit):null};
 }else{const group=scope.region?'f.survey_date':'f.region';const rows=await db.prepare('SELECT '+group+' AS label,'+aggregate+join+'WHERE '+where+' GROUP BY '+group+' ORDER BY '+group+(scope.region?' DESC':'')).bind(...args).all<LibrarySummary&{label:string}>();
  summary=rows.results.reduce((total,row)=>({schedules:total.schedules+row.schedules,withPhotos:total.withPhotos+row.withPhotos,withFieldPhotos:total.withFieldPhotos+row.withFieldPhotos,photos:total.photos+row.photos,bytes:total.bytes+row.bytes,fieldPhotos:total.fieldPhotos+row.fieldPhotos,fieldBytes:total.fieldBytes+row.fieldBytes,completed:total.completed+row.completed,downloaded:(total.downloaded||0)+(row.downloaded||0)}),emptySummary());
  cards=rows.results.map(({label,...summary})=>({key:label,label,leaf:false,target:{region:scope.region||label,date:scope.region?label:undefined,view:scope.view},summary,children:summary.schedules}));
 }
 return {...base,summary,cards:cards.slice(offset,offset+limit),teams:teamChoices,totalCards:cards.length,nextFoldersCursor:offset+limit<cards.length?String(offset+limit):null,pathLabels,canonicalAddressPath,place:firstPlace};
}
export async function libraryCatalog(db:D1Database,owner:string,params:URLSearchParams):Promise<Omit<LibraryPage,'photos'|'nextCursor'>>{
 const page=await catalog(db,owner,params),scope=librarySelection(params),scopes:ParticipantScope[]=[];
 if(scope.folder)scopes.push({key:'summary',folder:scope.folder});
 else if(scope.region&&scope.date)scopes.push({key:'summary',region:scope.region,date:scope.date});
 page.cards.forEach((card,index)=>{const {folder,region,date}=card.target;if(folder||region&&date)scopes.push({key:'card:'+index,folder,region,date});});
 const people=await surveyParticipants(db,owner,scopes);
 return {...page,summary:people.has('summary')?{...page.summary,participants:people.get('summary')}:page.summary,cards:page.cards.map((card,index)=>people.has('card:'+index)?{...card,summary:{...card.summary,participants:people.get('card:'+index)}}:card)};
}
