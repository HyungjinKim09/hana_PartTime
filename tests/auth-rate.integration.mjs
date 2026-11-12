import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';
const t=await testRuntime({productionAuthLimits:true,entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
export default {fetch(request,env,ctx){let queries=0;
 const db=new Proxy(env.DB,{get(target,key){if(key==='prepare')return sql=>{queries++;return target.prepare(sql);};const v=target[key];return typeof v==='function'?v.bind(target):v;}});
 const bindings={...env,DB:db};const mode=request.headers.get('x-synthetic-protection');
 if(mode==='missing')delete bindings.AUTH_LOGIN_IP;
 if(mode==='broken')bindings.AUTH_LOGIN_IP={async limit(){throw Error('synthetic unavailable');}};
 return withEnv(bindings,async()=>{const r=await worker.fetch(request,bindings,ctx);const out=new Response(r.body,r);out.headers.set('x-synthetic-db-queries',String(queries));return out;});
}};`});
const headers={'content-type':'application/json','cf-connecting-ip':'192.0.2.50'},body=JSON.stringify({username:'synthetic',password:'wrong-password-12345'});
try{
 for(let n=0;n<5;n++){const r=await t.request('/api/session',{method:'POST',headers,body});assert.equal(r.status,401);assert.ok(Number(r.headers.get('x-synthetic-db-queries'))>0);}
 for(let n=0;n<30;n++){
  const r=await t.request('/api/session',{method:'POST',headers:{...headers,'x-hana-identity':t.owner},body});assert.equal(r.status,429,'repeated password attempts are rejected at ingress');
  assert.equal(r.headers.get('x-synthetic-db-queries'),'0','blocked request must not touch D1');assert.equal(r.headers.get('retry-after'),'60');
 }
 const count=await t.db.prepare('SELECT MAX(attempts) n FROM site_login_limits').first();assert.equal(count.n,5,'blocked attempts do not update D1 counters');
 for(const path of ['/api//session','/api/session.rsc','/api/account','/api/account.rsc']){
  const r=await t.request(path,{method:'POST',headers,body});assert.equal(r.status,429,'aliases and admin setup share the exhausted credential budget');assert.equal(r.headers.get('x-synthetic-db-queries'),'0');
 }
 // Setup consumed one aggregate slot and the five allowed failures consumed five.
 // Four more independent IPs exhaust the same total bucket, not four new budgets.
 for(let n=0;n<4;n++)assert.equal((await t.request('/api/session',{method:'POST',headers:{...headers,'cf-connecting-ip':'192.0.2.'+(100+n)},body:JSON.stringify({username:'another-user',password:'wrong-password-12345'})})).status,401);
 const aggregate=await t.request('/api/session',{method:'POST',headers:{...headers,'cf-connecting-ip':'192.0.2.200'},body});assert.equal(aggregate.status,429);assert.equal(aggregate.headers.get('x-synthetic-db-queries'),'0');
 const logout=await t.request('/api/session',{method:'DELETE',headers});assert.equal(logout.status,200,'credential overload does not consume the logout budget');
 for(const mode of ['missing','broken']){
  const r=await t.request('/api/session',{method:'POST',headers:{...headers,'x-synthetic-protection':mode,'x-hana-identity':t.owner},body});assert.equal(r.status,503);assert.equal(r.headers.get('x-synthetic-db-queries'),'0','unavailable protection must not fall back to D1');
 }
 for(let n=0;n<60;n++){
  const r=await t.request('/api/session/refresh',{method:'POST',headers:{origin:t.origin,'cf-connecting-ip':'192.0.2.250',cookie:'__Host-hana_refresh='+'a'.repeat(32)+'.'+'b'.repeat(64)}});
  assert.equal(r.status,401);assert.equal(r.headers.get('x-synthetic-db-queries'),'1','allowed forged refresh proof only performs its indexed lookup');
 }
 const refreshBlocked=await t.request('/api/session/refresh',{method:'POST',headers:{'cf-connecting-ip':'192.0.2.250','x-hana-identity':t.owner}});
 assert.equal(refreshBlocked.status,429);assert.equal(refreshBlocked.headers.get('x-synthetic-db-queries'),'0');
 console.log('PASS: native Cloudflare limiter rejects repeated login attempts before any D1 prepare, including the persistent limit counter');
}finally{await t.close();}
