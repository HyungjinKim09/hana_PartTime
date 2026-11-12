import {subdividedArchiveParts} from './address-folders';
import {buildingCategory,exportFolderLabel} from './daily-report';
import type {Folder} from './types';
import {safeFilename} from './zip';

export function archiveFolderPaths(folders:Folder[],nestedDates:boolean){
 const ordered=[...folders].sort((a,b)=>a.id.localeCompare(b.id));
 const used=new Set<string>(),names=new Map<string,string>(),nested=new Map<string,string>();
 function reserve(date:string,base:string){
  const key=(label:string)=>`${date}/${label}`.toLowerCase();
  let label=base,index=1;
  while(used.has(key(label))){const suffix=` (${++index})`;label=base.slice(0,120-suffix.length)+suffix;}
  used.add(key(label));
  return label;
 }

 // Keep existing date-level names stable across full and filtered exports.
 for(const folder of ordered)names.set(folder.id,reserve(folder.date,safeFilename(exportFolderLabel(folder))));
 if(!nestedDates)return {names,nested};

 const dayKey=(folder:Folder)=>JSON.stringify([folder.region,folder.date]);
 const generalDays=new Set(ordered.filter(folder=>buildingCategory(folder)==='일반건물').map(dayKey));
 const buildings=new Map<string,{date:string;label:string;units:{id:string;path:string[]}[]}>();
 for(const folder of ordered){
  const day=dayKey(folder);
  if(!generalDays.has(day)||buildingCategory(folder)!=='구분건물')continue;
  const {building,unitPath}=subdividedArchiveParts(folder);
  const key=JSON.stringify([day,building.key]);
  const group=buildings.get(key)??{date:folder.date,label:building.label,units:[]};
  if(building.label.length>group.label.length)group.label=building.label;
  group.units.push({id:folder.id,path:unitPath});
  buildings.set(key,group);
 }
 for(const building of buildings.values()){
  const root=reserve(building.date,safeFilename(building.label));
  for(const unit of building.units)nested.set(unit.id,[root,...unit.path.map(safeFilename)].join('/'));
 }
 return {names,nested};
}
