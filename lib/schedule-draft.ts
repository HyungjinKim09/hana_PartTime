import type {ScheduleDraft} from './types';
export type SavedScheduleDraft={draft:ScheduleDraft;photos:File[]};
type StoredDraft={key:string;draft:ScheduleDraft;photos:{blob:Blob;name:string;lastModified:number}[]};
const key=(owner:string,manual:boolean)=>JSON.stringify([owner,manual]);
const operations=new Map<string,Promise<void>>();
function inOrder<T>(owner:string,manual:boolean,operation:()=>Promise<T>):Promise<T>{
 const id=key(owner,manual),job=(operations.get(id)||Promise.resolve()).then(operation);
 const settled=job.then(()=>{},()=>{});operations.set(id,settled);
 void settled.then(()=>{if(operations.get(id)===settled)operations.delete(id);});
 return job;
}
function database(){return new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('초안을 기기에 보관할 수 없습니다.'));return;}
 const request=indexedDB.open('hana-schedule-drafts',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'key'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 request.onblocked=()=>reject(Error('다른 HANA 탭을 닫고 다시 시도해 주세요.'));
});}
async function read(owner:string,manual:boolean):Promise<SavedScheduleDraft|null>{
 const db=await database();try{return await new Promise((resolve,reject)=>{
  const request=db.transaction('drafts').objectStore('drafts').get(key(owner,manual));
  request.onsuccess=()=>{const row=request.result as StoredDraft|undefined;resolve(row?{draft:row.draft,photos:row.photos.map(p=>new File([p.blob],p.name,{type:p.blob.type,lastModified:p.lastModified}))}:null);};request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
async function change(owner:string,manual:boolean,value?:SavedScheduleDraft){
 const db=await database();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');
  if(value)store.put({key:key(owner,manual),draft:value.draft,photos:value.photos.map(file=>({blob:file,name:file.name,lastModified:file.lastModified}))});
  else store.delete(key(owner,manual));
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('초안을 보관하지 못했습니다.'));
 });}finally{db.close();}
}
export function readScheduleDraft(owner:string,manual:boolean){return inOrder(owner,manual,()=>read(owner,manual));}
export function writeScheduleDraft(owner:string,manual:boolean,value:SavedScheduleDraft){return inOrder(owner,manual,()=>change(owner,manual,value));}
export function removeScheduleDraft(owner:string,manual:boolean){return inOrder(owner,manual,()=>change(owner,manual));}
