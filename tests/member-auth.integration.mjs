import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';
const t=await testRuntime();
const body=(value)=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
const cookies=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const as=(cookie,path,options={})=>t.mf.dispatchFetch(t.origin+path,{...options,headers:{origin:t.origin,cookie,...options.headers}});
try{
 const listing=await t.request('/api/members');assert.equal(listing.status,200,'administrator can list personnel');
 const accounts=[];for(const [username,displayName]of [['worker-a','테스트 작업자 A'],['worker-b','테스트 작업자 B']]){const r=await t.request('/api/members',body({username,displayName,password:'synthetic-worker-password-12345'}));assert.equal(r.status,201);accounts.push((await r.json()).member);}
 const login=async username=>{const r=await t.mf.dispatchFetch(t.origin+'/api/session',{...body({username,password:'synthetic-worker-password-12345'}),headers:{origin:t.origin,'content-type':'application/json'}});assert.equal(r.status,200);return cookies(r);};
 const a=await login('worker-a'),b=await login('worker-b');await t.folder('shared-fixture');
 const list=await(await as(a,'/api/library?region=테스트&date=2026-09-23')).json();assert.equal(list.cards[0].target.folder,'shared-fixture');assert.equal((await as(b,'/api/library?folder=shared-fixture')).status,200);
 assert.equal((await as(a,'/api/members')).status,403);assert.equal((await as(a,'/api/members',body({username:'injected','displayName':'위조','password':'synthetic-worker-password-12345'}))).status,403);
 assert.equal((await t.request('/api/members',body({username:'SYNTHETIC',displayName:'중복 관리자','password':'synthetic-worker-password-12345'}))).status,409);
 assert.equal((await t.request('/api/members',body({username:'WORKER-A',displayName:'중복 작업자','password':'synthetic-worker-password-12345'}))).status,409);
 const [raceStopped,stop]=await Promise.all([as(a,'/api/session/refresh',{method:'POST'}),t.request('/api/members',{...body({id:accounts[0].id,version:accounts[0].version,active:false}),method:'PATCH'})]);assert.equal(stop.status,200);if(raceStopped.status===200)assert.equal((await as(cookies(raceStopped),'/api/library')).status,401);
 assert.equal((await as(a,'/api/library')).status,401);assert.equal((await as(a,'/api/session/refresh',{method:'POST'})).status,401);assert.equal((await as(b,'/api/library')).status,200);
 const [raceReset,reset]=await Promise.all([as(b,'/api/session/refresh',{method:'POST'}),t.request('/api/members',{...body({id:accounts[1].id,version:accounts[1].version,password:'synthetic-changed-password-12345'}),method:'PATCH'})]);assert.equal(reset.status,200);if(raceReset.status===200)assert.equal((await as(cookies(raceReset),'/api/library')).status,401);assert.equal((await as(b,'/api/library')).status,401);assert.equal((await as(b,'/api/session/refresh',{method:'POST'})).status,401);
 const changed=await t.mf.dispatchFetch(t.origin+'/api/session',{...body({username:'worker-b',password:'synthetic-changed-password-12345'}),headers:{origin:t.origin,'content-type':'application/json'}});assert.equal(changed.status,200);const renewed=cookies(changed);assert.equal((await as(renewed,'/api/session/refresh',{method:'POST'})).status,200);assert.equal((await as(renewed,'/api/session',{method:'DELETE'})).status,200);assert.equal((await as(renewed,'/api/library')).status,401);
 const safe=JSON.stringify(await(await t.request('/api/members')).json());assert.ok(!safe.includes('password_hash')&&!safe.includes('salt')&&!safe.includes('synthetic-worker-password'));
 console.log('PASS: personal authentication, shared library, administrator boundary, collisions, per-member revocation, refresh and logout');
}finally{await t.close();}
