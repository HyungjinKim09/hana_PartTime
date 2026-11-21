import {identifyUpload,uploadId} from './upload-id.ts';
export type PendingUpload={key:string;owner:string;id:string;folder:string;kind:'photo'|'drawing';file:File;createdAt:number};
export const PENDING_LIMIT_BYTES=512*1024*1024,PENDING_LIMIT_COUNT=200;
const databaseName='hana-pending-originals',databaseVersion=2,eventName='hana-pending-uploads';
type DeviceUsage={key:'device';count:number;bytes:number};
let notification:ReturnType<typeof setTimeout>|undefined;
function notify(){if(typeof window!=='undefined'){clearTimeout(notification);notification=setTimeout(()=>window.dispatchEvent(new Event(eventName)),150);}}
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('이 브라우저에서는 사진 임시 보관을 사용할 수 없습니다. 원본을 기기에 따로 보관해 주세요.'));return;}
 const request=indexedDB.open(databaseName,databaseVersion);let settled=false;
 request.onupgradeneeded=()=>{
  const db=request.result,tx=request.transaction!;
  const photos=db.objectStoreNames.contains('photos')?tx.objectStore('photos'):db.createObjectStore('photos',{keyPath:'key'});
  if(!photos.indexNames.contains('by-owner'))photos.createIndex('by-owner','owner');
  const usage=db.objectStoreNames.contains('usage')?tx.objectStore('usage'):db.createObjectStore('usage',{keyPath:'key'});
  let count=0,bytes=0;
  const cursor=photos.openCursor();
  cursor.onsuccess=()=>{
   const row=cursor.result;
   if(row){const value=row.value as PendingUpload;count++;bytes+=value.file?.size||0;row.continue();}
   else usage.put({key:'device',count,bytes} satisfies DeviceUsage);
  };
 };
 request.onsuccess=()=>{
  const db=request.result;
  db.onversionchange=()=>db.close();
  if(settled){db.close();return;}
  settled=true;resolve(db);
 };
 request.onerror=()=>{if(!settled){settled=true;reject(request.error);}};
 request.onblocked=()=>{if(!settled){settled=true;reject(Error('다른 HANA 탭을 닫고 다시 시도해 주세요.'));}};
});}
export function pendingRecord(owner:string,folder:string,kind:'photo'|'drawing',file:File):PendingUpload{
 const id=uploadId(file);return {key:owner+':'+id,owner,id,folder,kind,file,createdAt:Date.now()};
}
export async function savePending(owner:string,folder:string,kind:'photo'|'drawing',files:File[]){
 const records=files.map(file=>pendingRecord(owner,folder,kind,file)),db=await open();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['photos','usage'],'readwrite'),store=tx.objectStore('photos'),usage=tx.objectStore('usage');
  const uniqueMap=new Map<string,PendingUpload>();
  for(const record of records)if(!uniqueMap.has(record.key))uniqueMap.set(record.key,record);
  const unique=[...uniqueMap.values()],present=new Set<string>();
  let base:DeviceUsage={key:'device',count:0,bytes:0},usageReady=false,keysReady=0,problem:Error|null=null;
  const usageRequest=usage.get('device');
  usageRequest.onsuccess=()=>{base=(usageRequest.result as DeviceUsage|undefined)||base;usageReady=true;finish();};
  for(const record of unique){
   const request=store.get(record.key);
   request.onsuccess=()=>{if(request.result)present.add(record.key);keysReady++;finish();};
  }
  function finish(){
   if(!usageReady||keysReady!==unique.length)return;
   const added=unique.filter(record=>!present.has(record.key));
   const count=base.count+added.length,bytes=base.bytes+added.reduce((total,record)=>total+record.file.size,0);
   if(count>PENDING_LIMIT_COUNT||bytes>PENDING_LIMIT_BYTES){problem=Error('기기 임시 보관은 200장·512MB까지 가능합니다. 미전송 사진을 먼저 저장하거나 정리해 주세요.');tx.abort();return;}
   for(const record of added)store.put(record);
   usage.put({key:'device',count,bytes} satisfies DeviceUsage);
  }
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(problem||tx.error);tx.onabort=()=>reject(problem||tx.error||Error('기기 임시 보관에 실패했습니다.'));
 });notify();return records;
 }finally{db.close();}
}
export async function listPending(owner:string){
 const db=await open();try{return await new Promise<PendingUpload[]>((resolve,reject)=>{
  const tx=db.transaction('photos'),request=tx.objectStore('photos').index('by-owner').getAll(owner);
  request.onsuccess=()=>resolve((request.result as PendingUpload[]).sort((a,b)=>a.createdAt-b.createdAt).map(record=>({...record,file:identifyUpload(record.file,record.id)})));
  request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
export async function countPending(owner:string){
 const db=await open();try{return await new Promise<number>((resolve,reject)=>{
  const request=db.transaction('photos').objectStore('photos').index('by-owner').count(owner);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
export async function deletePendingMany(owner:string,ids:string[]){
 if(!ids.length)return;
 const db=await open();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['photos','usage'],'readwrite'),store=tx.objectStore('photos'),usage=tx.objectStore('usage');
  const unique=[...new Set(ids)],found:PendingUpload[]=[];
  let base:DeviceUsage={key:'device',count:0,bytes:0},usageReady=false,keysReady=0;
  const usageRequest=usage.get('device');
  usageRequest.onsuccess=()=>{base=(usageRequest.result as DeviceUsage|undefined)||base;usageReady=true;finish();};
  for(const id of unique){
   const key=owner+':'+id,request=store.get(key);
   request.onsuccess=()=>{const record=request.result as PendingUpload|undefined;if(record?.owner===owner){found.push(record);store.delete(key);}keysReady++;finish();};
  }
  function finish(){
   if(!usageReady||keysReady!==unique.length)return;
   if(found.length)usage.put({key:'device',count:Math.max(0,base.count-found.length),bytes:Math.max(0,base.bytes-found.reduce((total,record)=>total+(record.file?.size||0),0))} satisfies DeviceUsage);
  }
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('기기 임시 보관 정리에 실패했습니다.'));
 });notify();}finally{db.close();}
}
export function deletePending(owner:string,id:string){return deletePendingMany(owner,[id]);}
export function watchPending(callback:()=>void){window.addEventListener(eventName,callback);return()=>window.removeEventListener(eventName,callback);}
