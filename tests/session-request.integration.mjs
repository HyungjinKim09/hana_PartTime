import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {testRuntime} from './test-runtime.mjs';

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
 const ordinary=await t.request('/api/library',{headers});assert.equal(ordinary.status,200);assert.equal(ordinary.headers.get('x-synthetic-session-checks'),'1','refresh preflight, identity fence and route share a verified lookup');
 const access=cookie.match(/__Host-fieldnote_session=([^;]+)/)[1];
 await t.db.prepare('UPDATE site_sessions SET expires_at=0 WHERE token_hash=?').bind(createHash('sha256').update(access).digest('hex')).run();
 const renewed=await t.request('/api/library',{headers});assert.equal(renewed.status,200);assert.equal(renewed.headers.get('x-synthetic-session-checks'),'2','the new access token is verified independently of the expired proof');
 const current=jar(renewed);
 const identity=await t.request('/api/identity',{headers:{cookie:current,'x-hana-identity':t.owner}});assert.equal(identity.status,200);assert.equal(identity.headers.get('x-synthetic-session-checks'),'1');
 const renewedAccess=current.match(/__Host-fieldnote_session=([^;]+)/)[1];
 const family=current.match(/__Host-hana_refresh=([^.;]+)/)[1];
 await t.db.prepare('UPDATE site_refresh_sessions SET previous_until=? WHERE id=?').bind(Date.now()+600000,family).run();
 await t.db.prepare('UPDATE site_sessions SET expires_at=0 WHERE token_hash=?').bind(createHash('sha256').update(renewedAccess).digest('hex')).run();
 const sameToken=await t.request('/api/library',{headers:{cookie:current,'x-hana-identity':t.owner}});
 assert.equal(sameToken.status,200,'refresh overlap may renew the same access token: discard its earlier expired result');
 assert.equal(jar(sameToken).match(/__Host-fieldnote_session=([^;]+)/)[1],renewedAccess,'exercise renewal of the same proof, not token rotation');
 assert.equal(sameToken.headers.get('x-synthetic-session-checks'),'2');
 const wrong=await t.request('/api/library',{headers:{cookie:current,'x-hana-identity':'forged-owner'}});assert.equal(wrong.status,409);
 assert.equal((await t.mf.dispatchFetch(t.origin+'/api/library',{headers:{'x-hana-identity':t.owner,'x-hana-user':t.owner}})).status,401,'client headers cannot create authentication');
 assert.equal((await t.request('/api/session',{method:'DELETE',headers:{cookie:current}})).status,200);
 assert.equal((await t.request('/api/library',{headers:{cookie:current}})).status,401,'a new request revalidates logout');
 console.log('PASS: actual worker preflight/fence/API verification once per request, independent refreshed-token validation, forged headers and logout revocation');
}finally{await t.close();}
