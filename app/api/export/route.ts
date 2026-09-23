import {addressParts,matchingAddress,withinAddress} from '@/lib/address-folders';
import {listFolders} from '@/lib/folders';
import {exportFolderLabel} from '@/lib/daily-report';
import {ApiError,failure,identity,storage,json,requireSameOrigin} from '@/lib/storage';
import {safeFilename} from '@/lib/zip';
import {archiveParts} from '@/lib/archive-parts';
import {sha256} from '@/lib/backup-format';
export const dynamic='force-dynamic';
export function GET(){return json({error:'다운로드 버튼에서 다시 시작해 주세요.'},405);}
export async function POST(request:Request){try{
  requireSameOrigin(request);
  const owner=await identity(request);const {db,bucket}=storage();const params=new URL(request.url).searchParams;
  const folder=params.get('folder'),region=params.get('region'),date=params.get('date');
  const photosOnly=params.get('photosOnly')==='1';
  const allFolders=await listFolders(db,owner);
  const folderNames=new Map<string,string>();const used=new Set<string>();
  // Resolve names before filtering so single-folder and full downloads agree.
  for(const f of [...allFolders].sort((a,b)=>a.id.localeCompare(b.id))){
    const base=safeFilename(exportFolderLabel(f));let name=base;let index=1;
    const key=(value:string)=>`${f.date}/${value}`.toLowerCase();
    while(used.has(key(name))){const suffix=` (${++index})`;name=base.slice(0,120-suffix.length)+suffix;}
    used.add(key(name));folderNames.set(f.id,name);
  }
  let folders=allFolders.filter(f=>(!folder||f.id===folder)&&(!region||f.region===region)&&(!date||f.date===date));
  const view=params.get('view');
  let addressPath:string[]=[];
  if(params.has('path')){try{const value=JSON.parse(params.get('path')!);if(!Array.isArray(value)||value.length>4||!value.every(x=>typeof x==='string'&&x.length<1000))throw Error();addressPath=value;}catch{throw new ApiError('주소 경로를 확인해 주세요.');}}
  if(view==='address'&&folder){const target=allFolders.find(f=>f.id===folder);folders=target?matchingAddress(allFolders,target).filter(f=>view==='address'||f.date===target.date):[];}
  if(view==='address')folders=folders.filter(f=>withinAddress(f,addressPath,view==='address'));
  if(!folders.length)throw new ApiError('폴더를 찾을 수 없습니다.',404);
  let name=safeFilename(folder?folderNames.get(folders[0].id)!:date||region||'현장사진_전체')+'.zip';
  const {results}=await db.prepare("SELECT id,folder,filename,object_key,size FROM photos WHERE owner=? AND folder IN(SELECT value FROM json_each(?)) AND deleted=0 AND kind='photo' ORDER BY created_at,id").bind(owner,JSON.stringify(folders.map(f=>f.id))).all<{id:string;folder:string;filename:string;object_key:string;size:number}>();
  let entries:{name:string;size:number;url:string|null;key?:string}[]=[];
  const byFolder=new Map<string,typeof results>();for(const photo of results){const rows=byFolder.get(photo.folder)||[];rows.push(photo);byFolder.set(photo.folder,rows);}
  if(photosOnly){
    folders=folders.filter(f=>byFolder.has(f.id));
    if(!folders.length)throw new ApiError('다운로드할 현장 사진이 없습니다. 사진이 있는 폴더를 선택해 주세요.');
  }
  const addOriginal=(name:string,key:string,size:number)=>{
    entries.push({name,size,url:'',key});
  };
  // One display name per address identity, even if road text differs by survey date.
  const canonicalNames=new Map<string,string>();
  for(const f of allFolders){const parts=addressParts(f,view==='address');parts.forEach((part,i)=>{const key=JSON.stringify([f.region,...parts.slice(0,i+1).map(p=>p.key)]);if(part.label.length>(canonicalNames.get(key)?.length||0))canonicalNames.set(key,part.label);});}
  const directories=new Set<string>();
  for(const f of folders){
    const sourceParts=addressParts(f,view==='address');
    const parts=sourceParts.map((p,i)=>safeFilename(canonicalNames.get(JSON.stringify([f.region,...sourceParts.slice(0,i+1).map(x=>x.key)]))||p.label));
    const relative=parts.slice(folder?parts.length-1:Math.max(0,addressPath.length-1));
    const path=view==='address'
      ?[...(!region&&!folder?[safeFilename(f.region)]:[]),...relative].join('/')+'/'
      :`${folder?'':f.date+'/'}${folderNames.get(f.id)}/`;
    if(!directories.has(path)){entries.push({name:path,size:0,url:null});directories.add(path);}
    for(const p of byFolder.get(f.id)||[])addOriginal(`${path}${p.id}_${safeFilename(p.filename)}`,p.object_key,p.size);
  }
  if(params.has('parts')||params.has('part')){
    const snapshot=await sha256(new TextEncoder().encode(JSON.stringify(entries))),parts=archiveParts(entries);
    if(params.has('parts'))return json({snapshot,parts:parts.map((p,index)=>({index,bytes:p.reduce((n,e)=>n+e.size,0),files:p.filter(e=>e.key).length}))});
    if(params.get('snapshot')!==snapshot)throw new ApiError('사진 목록이 변경됐습니다. 나눠 받기 목록을 새로 확인해 주세요.',409);
    const part=params.get('part')!;if(!/^\d+$/.test(part)||!parts[Number(part)])throw new ApiError('ZIP 분할 번호를 확인해 주세요.');
    entries=parts[Number(part)];name=name.replace(/\.zip$/,`_${Number(part)+1}of${parts.length}.zip`);
    // A directory can land in the previous part when its first photo exceeds the remaining space.
    if(photosOnly){const occupied=new Set(entries.filter(e=>e.key).map(e=>e.name.slice(0,e.name.lastIndexOf('/')+1)));entries=entries.filter(e=>e.key||occupied.has(e.name));}
  }
  const downloadKeys=entries.filter(e=>e.key).map(e=>e.key!);
  const totalBytes=entries.reduce((sum,entry)=>sum+entry.size,0);
  const maxBytes=params.get('maxBytes');
  if(maxBytes!==null&&(!/^\d+$/.test(maxBytes)||!Number.isSafeInteger(Number(maxBytes))))throw new ApiError('다운로드 크기를 확인해 주세요.');
  if(maxBytes!==null&&totalBytes>Number(maxBytes))throw new ApiError('이 브라우저에서는 한 번에 256MB까지 ZIP을 만들 수 있습니다. 날짜·폴더별로 나누거나 PC Chrome·Edge에서 다운로드해 주세요.',413);
  const tokens=await bucket.issueDownloads(owner,downloadKeys);let index=0;
  for(const entry of entries)if(entry.url!==null)entry.url='/api/export/'+tokens[index++];
  return json({name,entries:entries.map(({name,size,url})=>({name,size,url})),totalBytes,files:downloadKeys.length});
}catch(e){return failure(e);}}
