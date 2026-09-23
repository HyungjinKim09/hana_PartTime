import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingRecord,savePending} from '../lib/pending-uploads.ts';
import {identifyUpload,uploadId} from '../lib/upload-id.ts';
import {uploadPhotos} from '../lib/photo-upload.ts';
test('pending records preserve retry identity across recovered File objects and owner namespaces',()=>{
 const file=new File(['original'],'image.jpg'),a=pendingRecord('owner-a','folder','photo',file);
 assert.equal(pendingRecord('owner-a','folder','photo',file).key,a.key);
 const recovered=identifyUpload(new File([file],file.name),a.id);assert.equal(uploadId(recovered),a.id);
 assert.notEqual(pendingRecord('owner-b','folder','photo',recovered).key,a.key);
 assert.notEqual(uploadId(new File([file],file.name)),a.id,'a deliberate new selection is a new upload');
});
test('unavailable persistence rejects explicitly instead of reporting a durable save',async()=>{
 await assert.rejects(()=>savePending('owner','folder','photo',[new File(['photo'],'x.jpg')]),/임시 보관/);
});
test('aborting a batch does not start more requests and retains original retry IDs',async()=>{
 const controller=new AbortController(),files=Array.from({length:5},(_,i)=>new File(['x'],i+'.jpg'));let calls=0;const ids=[];
 const request=async(_url,options)=>{calls++;ids.push(options.headers['X-Upload-Id']);return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
 const batch=uploadPhotos(files,'folder','photo',{request,signal:controller.signal});controller.abort();
 const result=await batch;assert.equal(calls,3);assert.equal(result.failed.length,5);assert.deepEqual(ids,files.slice(0,3).map(uploadId));
});
