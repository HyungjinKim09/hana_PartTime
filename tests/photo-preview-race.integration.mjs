import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

// Pause exactly after rotation's snapshot SELECT; a second authenticated request
// installs a preview before rotation can publish its replacement.
let arrive,release;
const arrived=new Promise(resolve=>arrive=resolve),released=new Promise(resolve=>release=resolve);
const t=await testRuntime({
 entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
 export default {fetch(request,env,ctx){
  let pause=request.headers.get('x-test-pause')==='1';
  function statement(value){return new Proxy(value,{get(target,key){
   if(key==='bind')return(...args)=>statement(target.bind(...args));
   if(key==='first')return async(...args)=>{const row=await target.first(...args);if(pause){pause=false;await fetch('https://preview-race.invalid/pause');}return row;};
   const member=Reflect.get(target,key);return typeof member==='function'?member.bind(target):member;
  }});}
  const db=new Proxy(env.DB,{get(target,key){
   if(key==='prepare')return sql=>sql.includes('SELECT p.object_key,p.thumbnail_key')?statement(target.prepare(sql)):target.prepare(sql);
   const member=Reflect.get(target,key);return typeof member==='function'?member.bind(target):member;
  }});
  const bindings={...env,DB:db};return withEnv(bindings,()=>worker.fetch(request,bindings,ctx));
 }};`,
 outboundService:async request=>{
  assert.equal(new URL(request.url).hostname,'preview-race.invalid');
  arrive();await released;return new Response('continue');
 },
});
try{
 await t.folder();
 const photo=(await (await t.request('/api/library?folder=fixture&filename=race.png',{method:'POST',body:png})).json()).photo;
 const url='/api/photos/'+photo.id,tag=(await t.request(url)).headers.get('etag');
 const rotation=t.request(url,{method:'PATCH',headers:{'if-match':tag,'x-test-pause':'1'},body:png});
 await Promise.race([arrived,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('rotation snapshot was not reached')),10000);timer.unref();})]);
 const small=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,192,0,17,8,0,20,0,24,3,1,17,0,2,17,0,3,17,0,255,217]);
 const preview=await t.request(url,{method:'PUT',headers:{'if-match':tag,'content-type':'image/jpeg'},body:small});
 assert.equal(preview.status,200,await preview.clone().text());
 release();
 const response=await rotation;
 assert.equal(response.status,412,'rotation must not detach a preview installed after its snapshot');
 const row=await t.db.prepare('SELECT object_key,thumbnail_key FROM photos WHERE id=?').bind(photo.id).first();
 const bucket=await t.mf.getR2Bucket('BUCKET');
 assert.ok(row.thumbnail_key);
 assert.ok(await bucket.head(row.thumbnail_key));
 assert.deepEqual((await bucket.list({prefix:`photos/${t.owner}/${photo.id}/`})).objects.map(o=>o.key),[row.object_key]);
 assert.equal((await t.db.prepare('SELECT COUNT(*) AS n FROM upload_attempts').first()).n,0);
 assert.equal((await t.request(url,{method:'PATCH',headers:{'if-match':tag},body:png})).status,200,'retry uses the current preview fence');
 assert.equal(await bucket.head(row.thumbnail_key),null);
 console.log('PASS: concurrent preview installation fences rotation, leaves no untracked objects, and retry cleans both old representations');
}finally{release();await t.close();}
