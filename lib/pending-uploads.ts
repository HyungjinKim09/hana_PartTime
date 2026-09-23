import {identifyUpload,uploadId} from './upload-id.ts';
export type PendingUpload={key:string;owner:string;id:string;folder:string;kind:'photo'|'drawing';file:File;createdAt:number};
export const PENDING_LIMIT_BYTES=512*1024*1024,PENDING_LIMIT_COUNT=200;
const eventName='hana-pending-uploads';
let notification:ReturnType<typeof setTimeout>|undefined;
function notify(){if(typeof window!=='undefined'){clearTimeout(notification);notification=setTimeout(()=>window.dispatchEvent(new Event(eventName)),150);}}
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('이 브라우저에서는 사진 임시 보관을 사용할 수 없습니다. 원본을 기기에 따로 보관해 주세요.'));return;}
 const request=indexedDB.open('hana-pending-originals',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'key'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('다른 HANA 탭을 닫고 다시 시도해 주세요.'));
});}
export function pendingRecord(owner:string,folder:string,kind:'photo'|'drawing',file:File):PendingUpload{
 const id=uploadId(file);return {key:owner+':'+id,owner,id,folder,kind,file,createdAt:Date.now()};
}
export async function savePending(owner:string,folder:string,kind:'photo'|'drawing',files:File[]){
 const records=files.map(file=>pendingRecord(owner,folder,kind,file)),db=await open();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos'),request=store.getAll();let problem:Error|null=null;
  request.onsuccess=()=>{
   const existing=request.result as PendingUpload[],keys=new Set(existing.map(r=>r.key)),added=records.filter(r=>!keys.has(r.key));
   if(existing.length+added.length>PENDING_LIMIT_COUNT||[...existing,...added].reduce((n,r)=>n+r.file.size,0)>PENDING_LIMIT_BYTES){problem=Error('기기 임시 보관은 200장·512MB까지 가능합니다. 미전송 사진을 먼저 저장하거나 정리해 주세요.');tx.abort();return;}
   for(const r of records)if(!keys.has(r.key))store.put(r);
  };
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(problem||tx.error);tx.onabort=()=>reject(problem||tx.error||Error('기기 임시 보관에 실패했습니다.'));
 });notify();return records;
 }finally{db.close();}
}
export async function listPending(owner:string){const db=await open();try{return await new Promise<PendingUpload[]>((resolve,reject)=>{const tx=db.transaction('photos'),request=tx.objectStore('photos').getAll();request.onsuccess=()=>resolve((request.result as PendingUpload[]).filter(r=>r.owner===owner).sort((a,b)=>a.createdAt-b.createdAt).map(r=>({...r,file:identifyUpload(r.file,r.id)})));request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function countPending(owner:string){const db=await open();try{return await new Promise<number>((resolve,reject)=>{const request=db.transaction('photos').objectStore('photos').getAllKeys();request.onsuccess=()=>resolve(request.result.filter(key=>typeof key==='string'&&key.startsWith(owner+':')).length);request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function deletePendingMany(owner:string,ids:string[]){if(!ids.length)return;const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');for(const id of new Set(ids))store.delete(owner+':'+id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});notify();}finally{db.close();}}
export function deletePending(owner:string,id:string){return deletePendingMany(owner,[id]);}
export function watchPending(callback:()=>void){window.addEventListener(eventName,callback);return()=>window.removeEventListener(eventName,callback);}
