import type {Folder} from './types';
import {normalizeRoadAddress} from './address.js';
type Place=Pick<Folder,'id'|'region'|'lot'|'address'|'unit'|'unitDisplay'>;
export type AddressPart={key:string;label:string};
const clean=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const token=(s:string)=>clean(s).replace(/\s/g,'').toLowerCase();
export function addressParts(f:Place):AddressPart[]{
 const lot=clean(f.lot).replace(/(\d+)(?:\s*[-–−]\s*(\d+))?$/u,(_,a:string,b?:string)=>String(Number(a)).padStart(3,'0')+(b?'-'+String(Number(b)).padStart(3,'0'):''));
 const road=normalizeRoadAddress(f.address).match(/^(.*?(?:로|길)\s*\d+(?:-\d+)?)(?=\s|\(|$)/u)?.[1]||'';
 const detail=clean([f.unitDisplay||f.unit||'',f.address.replace(road,'')].join(' ')).replace(/[()]/g,' ');
 const building=detail.match(/([가-힣A-Za-z0-9][가-힣A-Za-z0-9 ]*?(?:아파트|APT|빌라|빌|맨션|타운|주택|오피스텔|팰리스|캐슬|하이츠|파크))(?=\s|\d|[A-Za-z]동|$)/iu)?.[1]?.trim()||clean(f.unitDisplay||f.unit||'').replace(/(?:[A-Za-z]|\d+)\s*동.*$|\d+(?:-\d+)?\s*호.*$/u,'').trim();
 const room=detail.match(/\b(\d+(?:-\d+)?)\s*호/u)?.[1];
 const block=detail.match(/([A-Za-z]|\d+)\s*동(?=\s|\d|$)/u)?.[1];
 const identity=token(lot||road)||`unknown:${f.id}`;
 const label=(lot||road||'주소 확인 필요')+(building?`(${building})`:'')+(lot&&road?`(${road})`:'');
 const parts:AddressPart[]=[{key:JSON.stringify([identity,token(building)]),label}];
 if(/아파트|APT/iu.test(building)||!!(block&&/^\d+$/.test(block)&&!/빌라|빌|주택|맨션/iu.test(building))){
  parts.push({key:'block:'+(block||'?'),label:block?block+'동':'동 미입력'});
  parts.push({key:'room:'+(room||'?'),label:room?room+'호':'호수 미입력'});
 }else if(room||block){
  const unit=[block&&block+'동',room&&room+'호'].filter(Boolean).join(' ');
  parts.push({key:'unit:'+token(unit),label:unit});
 }
 return parts;
}
export function withinAddress(f:Place,path:string[]){const parts=addressParts(f);return path.every((key,i)=>key==='@whole'?parts.length===i:parts[i]?.key===key);}
export function matchingAddress<T extends Place>(all:T[],target:Place):T[]{const key=JSON.stringify(addressParts(target).map(p=>p.key));return all.filter(f=>f.region===target.region&&JSON.stringify(addressParts(f).map(p=>p.key))===key);}
export function addressNodes(folders:Folder[],path:string[]){
 const nodes=new Map<string,{key:string;label:string;folders:Folder[];leaf:boolean}>();
 for(const f of folders){if(!withinAddress(f,path))continue;const parts=addressParts(f),part=parts[path.length]||{key:'@whole',label:'건물 전체·호수 미입력'};let node=nodes.get(part.key);if(!node){node={...part,folders:[],leaf:true};nodes.set(part.key,node);}if(part.label.length>node.label.length)node.label=part.label;node.folders.push(f);node.leaf&&=parts.length<=path.length+1;}
 return [...nodes.values()].sort((a,b)=>a.label.localeCompare(b.label,'ko',{numeric:true}));
}
