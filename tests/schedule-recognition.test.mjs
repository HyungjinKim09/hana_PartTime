import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeSchedulePhoto} from '../lib/schedule-recognition.ts';
test('recognition can cancel the initial availability request before uploading any original',async()=>{
 const previous=globalThis.fetch,controller=new AbortController();let uploaded=false;
 globalThis.fetch=async(_url,options={})=>{
  if(options.method==='POST')uploaded=true;
  return new Promise((_,reject)=>{options.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
 };
 try{
  const job=recognizeSchedulePhoto(new File(['x'],'x.jpg',{type:'image/jpeg'}),()=>{},{signal:controller.signal});
  controller.abort();
  await assert.rejects(job,{name:'AbortError'});
  assert.equal(uploaded,false);
 }finally{globalThis.fetch=previous;}
});
test('availability request has a bounded timeout with a retryable explanation',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async(_url,options={})=>new Promise((_,reject)=>{options.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
 try{await assert.rejects(recognizeSchedulePhoto(new File(['x'],'x.jpg'),()=>{},{timeoutMs:10}),/시간.*초과/);}
 finally{globalThis.fetch=previous;}
});
