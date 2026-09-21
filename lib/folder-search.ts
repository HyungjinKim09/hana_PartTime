import {buildingCategory} from './daily-report.ts';
import type {Folder} from './types';
import {addressParts} from './address-folders.ts';
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\d+/g,n=>String(Number(n))).replace(/[\s()·\-–−.,]/g,'');
export function searchFolders(folders:Folder[],query:string,view:'date'|'address',parentPath:string[]=[]){
 const terms=query.trim().split(/\s+/).map(normalize).filter(Boolean);
 if(!terms.length)return [];
 const groups=new Map<string,{folder:Folder;folders:Folder[];label:string;path:string[];count:number;matches:boolean;leaf:boolean;units:Set<string>;unitCount:number}>();
 for(const f of folders){
  const parts=addressParts(f,view==='address');
  const depth=Math.max(view==='address'?2:1,parentPath.length+1);
  const path=parts.slice(0,depth).map(p=>p.key);
  const key=JSON.stringify([f.region,view==='date'?f.date:'',...path]);
  const text=normalize([f.region,f.date,f.lot,f.address,f.unit||'',f.unitDisplay||'',f.name,...parts.map(p=>p.label)].join(' '));
  let group=groups.get(key);
  if(!group){group={folder:f,folders:[],label:parts.slice(0,depth).map(p=>p.label).join(' / '),path,count:0,matches:false,leaf:true,units:new Set(),unitCount:0};groups.set(key,group);}
  if(buildingCategory(f)==='구분건물')group.units.add(JSON.stringify(parts.map(p=>p.key)));
  group.unitCount=group.units.size;
  group.leaf&&=parts.length<=depth;group.folders.push(f);group.count+=f.count;group.matches ||=terms.every(term=>text.includes(term));
  if(f.date>group.folder.date)group.folder=f;
 }
 return [...groups.values()].filter(g=>g.matches).sort((a,b)=>a.folder.region.localeCompare(b.folder.region,'ko',{numeric:true})||a.label.localeCompare(b.label,'ko',{numeric:true})||b.folder.date.localeCompare(a.folder.date));
}
