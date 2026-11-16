import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingRecord,savePending} from '../lib/pending-uploads.ts';
import {identifyUpload,uploadId} from '../lib/upload-id.ts';
import {uploadPhotos} from '../lib/photo-upload.ts';
import {retryCaptureStorage} from '../lib/capture-recovery.ts';
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
test('retries only camera files that are still missing from device storage',async()=>{
 const [first,second,third]=['first','second','third'].map(name=>new File([name],name+'.jpg'));
 const shots=[{file:first,localSaved:true},{file:second,localSaved:false,uploadFailed:true},{file:third,localSaved:false}];
 const id=uploadId(second),calls=[];
 const partial=await retryCaptureStorage(shots,async file=>{calls.push(file.name);if(file===second)throw Error('기기 저장 실패');});
 assert.deepEqual(calls,['second.jpg','third.jpg']);
 assert.equal(partial.error.message,'기기 저장 실패');
 assert.deepEqual(partial.shots.map(shot=>shot.localSaved),[true,false,true]);
 const retry=await retryCaptureStorage(partial.shots,async file=>calls.push(file.name));
 assert.deepEqual(calls,['second.jpg','third.jpg','second.jpg']);
 assert.equal(retry.error,undefined);
 assert.deepEqual(retry.shots.map(shot=>shot.localSaved),[true,true,true]);
 assert.equal(retry.shots[1].uploadFailed,true);
 assert.equal(uploadId(retry.shots[1].file),id);
});
test('retrying a partial upload sends only failed files with their original upload identity',async()=>{
 const files=['saved','interrupted'].map(name=>new File([name],name+'.jpg'));
 const requests=[];
 const request=async(_url,options)=>{
  const file=options.body,id=options.headers['X-Upload-Id'];
  requests.push({file,id});
  if(file===files[1]&&requests.filter(entry=>entry.file===file).length===1)throw new TypeError('Network disconnected');
  return Response.json({photo:{id}});
 };
 const first=await uploadPhotos(files,'folder','photo',{request});
 assert.equal(first.saved,1);
 assert.deepEqual(first.failed,[files[1]]);
 const retry=await uploadPhotos(first.failed,'folder','photo',{request});
 assert.deepEqual(retry,{saved:1,failed:[]});
 assert.deepEqual(requests.map(entry=>entry.id),[uploadId(files[0]),uploadId(files[1]),uploadId(files[1])]);
});
test('aborting a batch does not start more requests and retains original retry IDs',async()=>{
 const controller=new AbortController(),files=Array.from({length:5},(_,i)=>new File(['x'],i+'.jpg'));let calls=0;const ids=[];
 const request=async(_url,options)=>{calls++;ids.push(options.headers['X-Upload-Id']);return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
 const batch=uploadPhotos(files,'folder','photo',{request,signal:controller.signal});controller.abort();
 const result=await batch;assert.equal(calls,3);assert.equal(result.failed.length,5);assert.deepEqual(ids,files.slice(0,3).map(uploadId));
});
