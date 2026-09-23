import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadPhotos} from '../lib/photo-upload.ts';

const files=(n)=>Array.from({length:n},(_,i)=>new File(['photo'],`${i}.jpg`,{type:'image/jpeg'}));
const ok=()=>new Response(JSON.stringify({photo:{id:'saved'}}),{status:201});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('starts three uploads and refills each free slot without waiting for the other photos',async()=>{
 const pending=[],started=[],progress=[];let active=0,peak=0;
 const batch=files(7);
 const task=uploadPhotos(batch,'folder / 1','photo',{
  request:async(url,options)=>{started.push({url,body:options.body});active++;peak=Math.max(peak,active);await new Promise(resolve=>pending.push(resolve));active--;return ok();},
  onProgress:done=>progress.push(done),
 });
 assert.equal(started.length,3);
 pending[1]();await tick();assert.equal(started.length,4,'a completed second photo immediately starts the fourth');
 assert.equal(progress[0],1);
 for(let i=0;i<7;i++){if(i!==1){pending[i]();await tick();}}
 const result=await task;
 assert.equal(peak,3);assert.equal(result.saved,7);assert.deepEqual(result.failed,[]);
 assert.deepEqual(progress,[1,2,3,4,5,6,7]);
 assert.deepEqual(started.map(x=>x.body),batch);
 assert.ok(started.every(x=>x.url.includes('folder=folder%20%2F%201')&&x.url.includes('kind=photo')));
});

test('HTTP/network failures remain retryable in selection order while other uploads finish',async()=>{
 const batch=files(5),errors=[];let calls=0;
 const result=await uploadPhotos(batch,'drawing-folder','drawing',{
  request:async(url,options)=>{calls++;if(options.body===batch[1])throw Error('network');if(options.body===batch[3])return new Response(JSON.stringify({error:'storage full'}),{status:429});return ok();},
  onError:(file,error)=>errors.push([file,error.message]),
 });
 assert.equal(calls,5);assert.equal(result.saved,3);assert.deepEqual(result.failed,[batch[1],batch[3]]);assert.equal(errors.length,2);
 const retried=[];
 const retry=await uploadPhotos(result.failed,'drawing-folder','drawing',{request:async(url,options)=>{retried.push(options.body);return ok();}});
 assert.deepEqual(retried,[batch[1],batch[3]]);assert.equal(retry.saved,2);
});

test('empty batches and oversized files do not send upload requests',async()=>{
 let calls=0;const request=async()=>{calls++;return ok();};
 assert.deepEqual(await uploadPhotos([],'folder','photo',{request}),{saved:0,failed:[]});
 const big=new File([new Uint8Array(20*1024*1024+1)],'big.jpg');
 assert.deepEqual((await uploadPhotos([big],'folder','photo',{request})).failed,[big]);assert.equal(calls,0);
});

test('reports each confirmed photo before the whole batch finishes, preserving selection identity',async()=>{
 const batch=files(4),pending=[],started=[],saved=[],errors=[];
 const task=uploadPhotos(batch,'folder','photo',{
  request:async(url,options)=>{const index=batch.indexOf(options.body);await new Promise(resolve=>pending[index]=resolve);return index===0?new Response(JSON.stringify({error:'failed'}),{status:503}):new Response(JSON.stringify({photo:{id:'photo-'+index}}),{status:201});},
  onStart:(file,index)=>started.push([file,index]),
  onSaved:(file,photo,index,elapsedMs)=>saved.push({file,photo,index,elapsedMs}),
  onError:(file,error,index)=>errors.push(index),
 });
 assert.deepEqual(started.map(x=>x[1]),[0,1,2]);
 assert.equal(saved.length,0,'a local preview is not a confirmed save');
 pending[1]();await tick();
 assert.equal(saved.length,1,'the first successful response is exposed while other uploads are pending');
 assert.equal(saved[0].file,batch[1]);assert.equal(saved[0].photo.id,'photo-1');assert.equal(saved[0].index,1);assert.ok(saved[0].elapsedMs>=0);
 assert.deepEqual(started.map(x=>x[1]),[0,1,2,3]);
 pending[0]();pending[2]();pending[3]();
 const result=await task;assert.deepEqual(errors,[0]);assert.equal(result.saved,3);assert.deepEqual(result.failed,[batch[0]]);
});

test('a successful save stays saved if its display callback fails',async(t)=>{
 t.mock.method(console,'error',()=>{});
 const batch=files(1);
 const result=await uploadPhotos(batch,'folder','photo',{request:async()=>ok(),onSaved:()=>{throw Error('display failure');}});
 assert.equal(result.saved,1);assert.deepEqual(result.failed,[]);
});

test('does not confirm a save when the response is missing its photo identity',async()=>{
 let saved=0;const batch=files(1);
 const result=await uploadPhotos(batch,'folder','photo',{request:async()=>new Response('{}'),onSaved:()=>saved++});
 assert.equal(saved,0);assert.equal(result.saved,0);assert.deepEqual(result.failed,batch);
});
