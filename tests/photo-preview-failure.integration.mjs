import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';


let arrive,release;
const arrived=new Promise(resolve=>arrive=resolve),released=new Promise(resolve=>release=resolve);
const t=await testRuntime({
 entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
 export default {fetch(request,env,ctx){
  const failDeletes=request.headers.get('x-test-r2-delete-failure')==='1';
  let pause=failDeletes;
  function statement(value){return new Proxy(value,{get(target,key){
   if(key==='bind')return(...args)=>statement(target.bind(...args));
   if(key==='first')return async(...args)=>{const row=await target.first(...args);if(pause){pause=false;await fetch('https://preview-failure.invalid/pause');}return row;};
   const member=Reflect.get(target,key);return typeof member==='function'?member.bind(target):member;
  }});}
  const db=new Proxy(env.DB,{get(target,key){
   if(key==='prepare')return sql=>sql.includes('SELECT p.version,p.thumbnail_key')?statement(target.prepare(sql)):target.prepare(sql);
   const member=Reflect.get(target,key);return typeof member==='function'?member.bind(target):member;
  }});
  const bucket=new Proxy(env.BUCKET,{get(target,key){
   if(key==='delete')return async objectKey=>{
    if(failDeletes&&String(objectKey).startsWith('thumbnails/'))throw Error('synthetic R2 deletion unavailable');
    return target.delete(objectKey);
   };
   const member=Reflect.get(target,key);return typeof member==='function'?member.bind(target):member;
  }});
  const bindings={...env,DB:db,BUCKET:bucket};return withEnv(bindings,()=>worker.fetch(request,bindings,ctx));
 }};`,
 outboundService:async request=>{assert.equal(new URL(request.url).hostname,'preview-failure.invalid');arrive();await released;return new Response('continue');},
});
try{
 await t.folder();
 const photo=(await (await t.request('/api/library?folder=fixture&filename=loser.png',{method:'POST',body:png})).json()).photo;
 const url='/api/photos/'+photo.id,tag=(await t.request(url)).headers.get('etag');
 const small=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,192,0,17,8,0,20,0,24,3,1,17,0,2,17,0,3,17,0,255,217]);
 const loser=t.request(url,{method:'PUT',headers:{'if-match':tag,'content-type':'image/jpeg','x-test-r2-delete-failure':'1'},body:small});
 await Promise.race([arrived,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('preview snapshot not reached')),10000);timer.unref();})]);
 assert.equal((await t.request(url,{method:'PUT',headers:{'if-match':tag,'content-type':'image/jpeg'},body:small})).status,200);
 const winner=(await t.db.prepare('SELECT thumbnail_key FROM photos WHERE owner=? AND id=?').bind(t.owner,photo.id).first()).thumbnail_key;
 release();const failed=await loser;
 assert.equal(failed.status,503);
 const bucket=await t.mf.getR2Bucket('BUCKET');
 const orphans=(await bucket.list({prefix:`thumbnails/${t.owner}/${photo.id}/`})).objects.filter(object=>object.key!==winner);
 const attempts=(await t.db.prepare('SELECT * FROM upload_attempts WHERE owner=?').bind(t.owner).all()).results;
 console.log(JSON.stringify({status:failed.status,orphanKeys:orphans.map(o=>o.key),attempts}));
 assert.equal(orphans.length,1,'failed R2 delete leaves a physical object');
 assert.deepEqual(attempts.map(row=>row.object_key),[orphans[0].key],'failed cleanup must retain its maintenance retry marker');
 await t.db.prepare('UPDATE upload_attempts SET started_at=0 WHERE owner=?').bind(t.owner).run();
 assert.equal((await t.request('/api/maintenance',{method:'POST'})).status,200);
 assert.equal(await bucket.head(orphans[0].key),null,'healthy maintenance must remove the losing preview');
 assert.ok(await bucket.head(winner),'maintenance must preserve the published preview');
 assert.equal((await t.db.prepare('SELECT COUNT(*) AS n FROM upload_attempts WHERE owner=?').bind(t.owner).first()).n,0);
 console.log('PASS: losing preview survives deletion failure with a retry marker, then healthy maintenance removes only the orphan');
}finally{release();await t.close();}
