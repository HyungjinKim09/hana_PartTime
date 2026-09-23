import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareUploadBatches} from '../lib/upload-preparation.ts';
import {uploadPhotos} from '../lib/photo-upload.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('first persisted batch uploads while remaining originals are still being saved locally',async()=>{
 const files=Array.from({length:7},(_,i)=>new File(['original'],i+'.jpg')),commits=[],sent=[];
 const prepared=prepareUploadBatches(files,()=>new Promise(resolve=>commits.push(resolve)));
 const task=uploadPhotos(files,'folder','photo',{beforeUpload:(_file,i)=>prepared.ready[i],request:async(_url,{body})=>{sent.push(body);return new Response(JSON.stringify({photo:{id:body.name}}));}});
 await tick();assert.equal(sent.length,0);commits[0]();await tick();assert.equal(sent.length,3);
 commits[1]();await tick();assert.equal(sent.length,6);commits[2]();
 assert.equal((await task).saved,7);await prepared.done;assert.deepEqual(sent,files);
});
test('persistence failure is exposed and does not strand later files',async()=>{
 const files=Array.from({length:4},()=>new File(['x'],'x.jpg'));let calls=0;
 const prepared=prepareUploadBatches(files,async()=>{if(++calls===1)throw Error('quota');});
 assert.match((await prepared.ready[0]).message,/quota/);assert.equal(await prepared.ready[3],null);await prepared.done;
});
test('cancelling while local storage is pending sends no requests but keeps preparing recovery files',async()=>{
 const files=Array.from({length:7},(_,i)=>new File(['original'],i+'.jpg')),commits=[],persisted=[];let calls=0;
 const prepared=prepareUploadBatches(files,batch=>new Promise(resolve=>commits.push(()=>{persisted.push(...batch);resolve();})));
 const controller=new AbortController();
 const task=uploadPhotos(files,'folder','photo',{signal:controller.signal,beforeUpload:(_file,i)=>prepared.ready[i],request:async()=>{calls++;return new Response('{}');}});
 controller.abort();commits[0]();await tick();commits[1]();await tick();commits[2]();
 await prepared.done;const result=await task;assert.equal(calls,0);assert.deepEqual(result.failed,files);assert.deepEqual(persisted,files);
});
