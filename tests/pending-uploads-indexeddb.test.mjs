import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {countPending,deletePendingMany,listPending,savePending} from '../lib/pending-uploads.ts';
import {identifyUpload} from '../lib/upload-id.ts';

const databaseName='hana-pending-originals';
function deleteDatabase(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.deleteDatabase(databaseName);
  request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('test database is still open'));
 });
}
function openVersionOne(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(databaseName,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function seedVersionOne(records){
 const db=await openVersionOne();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');
  for(const record of records)store.put(record);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
async function storedUsage(){
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open(databaseName);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('usage'),request=tx.objectStore('usage').get('device');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
const file=(name,contents)=>new File([contents],name,{type:'image/jpeg'});

test('v1 migration retains owner records and backfills aggregate count and original bytes',async()=>{
 await deleteDatabase();
 try{
  await seedVersionOne([
   {key:'owner-a:first',owner:'owner-a',id:'first',folder:'folder-a',kind:'photo',file:file('first.jpg','1234'),createdAt:20},
   {key:'owner-b:second',owner:'owner-b',id:'second',folder:'folder-b',kind:'drawing',file:file('second.jpg','12345678'),createdAt:10},
   {key:'owner-a:third',owner:'owner-a',id:'third',folder:'folder-c',kind:'photo',file:file('third.jpg','12'),createdAt:30},
  ]);

  assert.deepEqual((await listPending('owner-a')).map(item=>item.id),['first','third']);
  assert.deepEqual(await countPending('owner-a'),2);
  assert.deepEqual(await countPending('owner-b'),1);
  assert.deepEqual(await storedUsage(),{key:'device',count:3,bytes:14});
 }finally{await deleteDatabase();}
});

test('save and delete update device totals once per stable upload identity',async()=>{
 await deleteDatabase();
 try{
  const first=file('first.jpg','12345'),duplicate=identifyUpload(file('replacement.jpg','replacement is larger'),'stable-id');
  identifyUpload(first,'stable-id');
  const second=file('second.jpg','1234567');
  const saved=await savePending('owner-a','folder-a','photo',[first,duplicate,second]);
  assert.equal(saved.length,3);
  assert.deepEqual(await countPending('owner-a'),2);
  assert.deepEqual(await storedUsage(),{key:'device',count:2,bytes:12});
  assert.deepEqual((await listPending('owner-a')).map(item=>item.file.name),['first.jpg','second.jpg']);

  await deletePendingMany('owner-a',[saved[0].id,saved[0].id,'missing-id']);
  assert.deepEqual(await countPending('owner-a'),1);
  assert.deepEqual(await storedUsage(),{key:'device',count:1,bytes:7});
  await deletePendingMany('owner-a',[saved[2].id]);
  assert.deepEqual(await storedUsage(),{key:'device',count:0,bytes:0});
 }finally{await deleteDatabase();}
});

test('migrated device-wide count quota rejects a new account without changing saved files or totals',async()=>{
 await deleteDatabase();
 try{
  await seedVersionOne(Array.from({length:200},(_,index)=>{
   const id='old-'+index;
   return {key:'owner-a:'+id,owner:'owner-a',id,folder:'folder-a',kind:'photo',file:file(id+'.jpg','x'),createdAt:index};
  }));

  await assert.rejects(savePending('owner-b','folder-b','photo',[file('new.jpg','new')]),/200장·512MB/);
  assert.deepEqual(await countPending('owner-a'),200);
  assert.deepEqual(await countPending('owner-b'),0);
  assert.deepEqual(await storedUsage(),{key:'device',count:200,bytes:200});
 }finally{await deleteDatabase();}
});
