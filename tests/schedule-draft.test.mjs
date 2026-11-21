import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {readScheduleDraft,writeScheduleDraft,removeScheduleDraft} from '../lib/schedule-draft.ts';

globalThis.indexedDB=indexedDB;
test('reopening waits for the latest queued write even when an earlier database open is slow',async()=>{
 const snapshot=notes=>({draft:{region:'대기 검증',date:'2026-11-20',folders:[{lot:'1-1',time:'',name:'',phones:[],address:'',notes,group:1}],warnings:[]},photos:[]});
 await writeScheduleDraft('queued-account',true,snapshot('older'));
 let release,held=false;
 globalThis.indexedDB={open(...args){
  const request=indexedDB.open(...args);
  if(held)return request;held=true;
  return new Proxy(request,{get(target,name){return Reflect.get(target,name,target);},set(target,name,value){
   if(name==='onsuccess'){target.onsuccess=()=>{release=()=>value();};return true;}
   return Reflect.set(target,name,value,target);
  }});
 }};
 let write,read,observed=false;
 try{
  write=writeScheduleDraft('queued-account',true,snapshot('latest'));
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  read=readScheduleDraft('queued-account',true).then(value=>{observed=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(observed,false,'a reopened form must not restore data ahead of an earlier write');
 }finally{release?.();await write;globalThis.indexedDB=indexedDB;}
 assert.equal((await read).draft.folders[0].notes,'latest');
 await removeScheduleDraft('queued-account',true);
});
test('unfinished schedule and originals survive reopening and remain isolated by account and input mode',async()=>{
 const draft={region:'사직4구역',date:'2026-11-19',folders:[{lot:'사직동 1-1',name:'',time:'',unit:'',phones:[],address:'',notes:'작성 중',group:2}],warnings:[]};
 const photo=new File(['original'],'schedule.jpg',{type:'image/jpeg',lastModified:123});
 await writeScheduleDraft('account-a',false,{draft,photos:[photo]});
 const restored=await readScheduleDraft('account-a',false);
 assert.deepEqual(restored.draft,draft);
 assert.equal(restored.photos[0].name,'schedule.jpg');
 assert.equal(await restored.photos[0].text(),'original');
 assert.equal(await readScheduleDraft('account-b',false),null);
 assert.equal(await readScheduleDraft('account-a',true),null);
 await removeScheduleDraft('account-a',false);
 assert.equal(await readScheduleDraft('account-a',false),null);
});
