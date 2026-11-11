import assert from 'node:assert/strict';
import {testRuntime,expiredAccess} from './test-runtime.mjs';

// Observe actual D1 prepares at the worker boundary, including framework routes.
// withEnv ensures both env.DB and cloudflare:workers' imported env see the same
// test-only observer. Production has no counter/header or replacement binding.
const t=await testRuntime({entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
export default {fetch(request,env,ctx){
 let checks=0;const db=new Proxy(env.DB,{get(target,key){if(key==='prepare')return sql=>{if(sql.startsWith('SELECT a.owner,COALESCE('))checks++;return target.prepare(sql);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const bindings={...env,DB:db};return withEnv(bindings,async()=>{const r=await worker.fetch(request,bindings,ctx);const response=new Response(r.body,r);response.headers.set('x-synthetic-session-checks',String(checks));return response;});
}};`});
const jar=response=>response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const json={'content-type':'application/json'};
try{
 const login=await t.request('/api/session',{method:'POST',headers:json,body:JSON.stringify({username:'synthetic',password:'synthetic-password-12345'})});assert.equal(login.status,200);
 const cookie=jar(login),headers={cookie,'x-hana-identity':t.owner};
 const ordinary=await t.request('/api/library',{headers});assert.equal(ordinary.status,200);assert.equal(ordinary.headers.get('x-synthetic-session-checks'),'0','ordinary reads verify the signed cookie without D1');
 const access=cookie.match(/__Host-fieldnote_session=([^;]+)/)[1];
 const privileged=await t.request('/api/members',{headers});
 assert.equal(privileged.status,200);assert.equal(privileged.headers.get('x-synthetic-session-checks'),'1');
 const expiredCookie=cookie.replace(access,expiredAccess(access,t.adminKey));
 const renewed=await t.request('/api/library',{headers:{...headers,cookie:expiredCookie}});
 assert.equal(renewed.status,200);
 const current=jar(renewed);assert.ok(current.includes('__Host-hana_refresh='));
 const identity=await t.request('/api/identity',{headers:{cookie:current,'x-hana-identity':t.owner}});
 assert.equal(identity.status,200);assert.equal(identity.headers.get('x-synthetic-session-checks'),'0');
 const signed=current.match(/__Host-fieldnote_session=([^;]+)/)[1];
 const parts=signed.split('.');
 const payload=JSON.parse(Buffer.from(parts[1],'base64url'));
 parts[1]=Buffer.from(JSON.stringify({...payload,user:{...payload.user,owner:'forged-owner'}})).toString('base64url');
 const tampered=await t.request('/api/library',{headers:{cookie:'__Host-fieldnote_session='+parts.join('.')}});
 assert.equal(tampered.status,401);assert.equal(tampered.headers.get('x-synthetic-session-checks'),'0');
 const wrong=await t.request('/api/library',{headers:{cookie:current,'x-hana-identity':'forged-owner'}});assert.equal(wrong.status,409);
 assert.equal((await t.mf.dispatchFetch(t.origin+'/api/library',{headers:{'x-hana-identity':t.owner,'x-hana-user':t.owner}})).status,401);
 // Exercise access-only logout, including revocation of its refresh family.
 assert.equal((await t.request('/api/session',{method:'DELETE',headers:{cookie:'__Host-fieldnote_session='+signed}})).status,200);
 assert.equal((await t.request('/api/session/refresh',{method:'POST',headers:{cookie:current}})).status,401);
 assert.equal((await t.request('/api/members',{headers:{cookie:current}})).status,401);
 assert.equal((await t.request('/api/library',{method:'DELETE',headers:{cookie:current}})).status,401);
 assert.equal((await t.request('/api/library',{headers:{cookie:current}})).status,200,'signed reads remain valid until access expiry');
 assert.equal((await t.request('/api/library',{headers:{cookie:current.replace(signed,expiredAccess(signed,t.adminKey))}})).status,401);
 console.log('PASS: signed reads bypass D1 authentication, privileged reads and writes enforce revocation, and expiry and tampering are rejected');
}finally{await t.close();}
