import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {testRuntime,expiredAccess,png} from './test-runtime.mjs';

// Count actual D1 prepares at the worker boundary. withEnv makes the observer
// visible to framework routes without changing production bindings.
const t=await testRuntime({entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
export default {fetch(request,env,ctx){
 let checks=0,queries=0;
 const db=new Proxy(env.DB,{get(target,key){if(key==='prepare')return sql=>{queries++;if(sql.startsWith('SELECT a.owner,COALESCE('))checks++;return target.prepare(sql);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const bindings={...env,DB:db};return withEnv(bindings,async()=>{const r=await worker.fetch(request,bindings,ctx);const response=new Response(r.body,r);response.headers.set('x-synthetic-session-checks',String(checks));response.headers.set('x-synthetic-db-queries',String(queries));return response;});
}};`});
const json={'content-type':'application/json'};
const cookieMap=response=>Object.fromEntries(response.headers.getSetCookie().map(value=>{const pair=value.split(';')[0],i=pair.indexOf('=');return [pair.slice(0,i),pair.slice(i+1)];}));
const cookieHeader=jar=>Object.entries(jar).map(([key,value])=>`${key}=${value}`).join('; ');
const merged=(jar,response)=>({...jar,...cookieMap(response)});
const checks=response=>Number(response.headers.get('x-synthetic-session-checks')||0);
const queries=response=>Number(response.headers.get('x-synthetic-db-queries')||0);
const request=(path,options={},jar)=>t.request(path,{...options,headers:{...(jar?{cookie:cookieHeader(jar)}:{}),...options.headers}});
const proofFree=(response,label)=>assert.equal(checks(response),0,`${label} should not query persisted session proof`);
const proofRequired=(response,label)=>assert.ok(checks(response)>0,`${label} must check persisted session proof`);
try{
 const login=await request('/api/session',{method:'POST',headers:json,body:JSON.stringify({username:'synthetic',password:'synthetic-password-12345'})});
 assert.equal(login.status,200);assert.ok(queries(login)>0,'login remains D1-backed');
 let adminJar=cookieMap(login);assert.ok(adminJar['__Host-hana_refresh']);

 const ordinary=await request('/api/library',{},adminJar);assert.equal(ordinary.status,200);proofFree(ordinary,'valid signed library read');
 const members=await request('/api/members',{},adminJar);assert.equal(members.status,200);proofFree(members,'admin member listing');assert.ok(queries(members)>0,'member listing still queries its data');

 // Ordinary write methods and the native ZIP path all trust a valid signed
 // access token. The API work itself may still issue unrelated D1 queries.
 await t.folder('fixture');
 const upload=await request('/api/library?folder=fixture&filename=photo.png',{method:'POST',body:png},adminJar);
 assert.equal(upload.status,201,await upload.clone().text());proofFree(upload,'photo upload');const photo=(await upload.json()).photo;
 const folderEdit=await request('/api/folders',{method:'PATCH',headers:json,body:JSON.stringify({id:'fixture',revision:1,remarks:'signed update',buildingDetails:'',surveyStatus:'완료'})},adminJar);
 assert.equal(folderEdit.status,200,await folderEdit.clone().text());proofFree(folderEdit,'folder PATCH');
 const schedule=await request('/api/schedules',{method:'POST',headers:json,body:JSON.stringify({region:'signed schedule',date:'2026-11-19',folders:[{lot:'signed 1-1',unit:'',time:'오전중',name:'signed',phones:[],address:'',notes:'',group:1}],warnings:[]})},adminJar);
 assert.equal(schedule.status,201,await schedule.clone().text());proofFree(schedule,'schedule POST');

 const manifestResponse=await request('/api/export?folder=fixture&track=1',{method:'POST'},adminJar);
 assert.equal(manifestResponse.status,200);proofFree(manifestResponse,'ZIP preparation');const manifest=await manifestResponse.json();
 const entry=manifest.entries.find(value=>value.url);assert.ok(entry?.url);
 const original=await request(entry.url,{},adminJar);assert.equal(original.status,200);await original.arrayBuffer();proofFree(original,'native ZIP original');
 const completed=await request('/api/export?completed=1',{method:'POST',headers:json,body:JSON.stringify({receipts:manifest.downloadReceipts})},adminJar);
 assert.equal(completed.status,200);assert.equal((await completed.json()).marked,1);proofFree(completed,'ZIP completion');
 const deleted=await request('/api/library?id='+encodeURIComponent(photo.id),{method:'DELETE'},adminJar);
 assert.equal(deleted.status,200,await deleted.clone().text());proofFree(deleted,'photo DELETE');

 // Admin reads are signed; mutations and settings remain proof-protected.
 const createdResponse=await request('/api/members',{method:'POST',headers:json,body:JSON.stringify({username:'worker-test',displayName:'Worker Test',password:'synthetic-worker-password-12345'})},adminJar);
 assert.equal(createdResponse.status,201,await createdResponse.clone().text());proofRequired(createdResponse,'member creation');const member=(await createdResponse.json()).member;
 const changedMember=await request('/api/members',{method:'PATCH',headers:json,body:JSON.stringify({id:member.id,version:member.version,displayName:'Worker Updated'})},adminJar);
 assert.equal(changedMember.status,200,await changedMember.clone().text());proofRequired(changedMember,'member update');
 const settings=await request('/api/settings',{method:'PUT',headers:{...json,'x-admin-key':t.adminKey},body:JSON.stringify({storageGB:12,acknowledgeCost:true})},adminJar);
 assert.equal(settings.status,200,await settings.clone().text());proofRequired(settings,'settings update');

 const workerLogin=await request('/api/session',{method:'POST',headers:json,body:JSON.stringify({username:'worker-test',password:'synthetic-worker-password-12345'})});
 assert.equal(workerLogin.status,200);assert.ok(queries(workerLogin)>0);const workerJar=cookieMap(workerLogin);
 const forbidden=await request('/api/members',{},workerJar);assert.equal(forbidden.status,403);proofFree(forbidden,'member role check');

 // Legacy opaque tokens still consult their stored proof and upgrade to signed
 // access. A valid signed token can then access the same route without proof.
 const legacy='a'.repeat(64),version=(await t.db.prepare('SELECT version FROM site_account WHERE id=1').first()).version;
 await t.db.prepare('INSERT INTO site_sessions(token_hash,version,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(legacy).digest('hex'),version,Date.now()+7*86400000).run();
 const legacyResponse=await request('/api/library',{headers:{cookie:'__Host-fieldnote_session='+legacy}});
 assert.equal(legacyResponse.status,200);proofRequired(legacyResponse,'legacy token lookup');assert.ok(cookieMap(legacyResponse)['__Host-hana_refresh']);

 // Credential reset is sensitive and must validate the active proof.
 const reset=await request('/api/account',{method:'POST',headers:{...json,'x-admin-key':t.adminKey},body:JSON.stringify({username:'synthetic',password:'synthetic-password-12345'})},adminJar);
 assert.equal(reset.status,200,await reset.clone().text());proofRequired(reset,'admin credential reset');

 // A fresh session lets us check refresh/expiry/logout independently from the
 // credential reset above, which deliberately invalidates older sessions.
 const freshLogin=await request('/api/session',{method:'POST',headers:json,body:JSON.stringify({username:'synthetic',password:'synthetic-password-12345'})});
 assert.equal(freshLogin.status,200);assert.ok(queries(freshLogin)>0);adminJar=cookieMap(freshLogin);
 const directRefresh=await request('/api/session/refresh',{method:'POST'},adminJar);
 assert.equal(directRefresh.status,200);assert.ok(queries(directRefresh)>0,'refresh stays D1-backed');adminJar=merged(adminJar,directRefresh);
 const accessName='__Host-fieldnote_session',refreshName='__Host-hana_refresh';
 const expiredJar={...adminJar,[accessName]:expiredAccess(adminJar[accessName],t.adminKey)};
 const renewed=await request('/api/library',{},expiredJar);assert.equal(renewed.status,200);assert.ok(queries(renewed)>0,'expired access refresh uses D1');adminJar=merged(adminJar,renewed);

 const signed=adminJar[accessName];
 const wrong=await request('/api/library',{headers:{'x-hana-identity':'forged-owner'}},adminJar);assert.equal(wrong.status,409);proofFree(wrong,'signed identity scope validation');
 const [prefix,payload,signature]=signed.split('.');
 const tamperedPayload=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url').toString()),user:{...JSON.parse(Buffer.from(payload,'base64url').toString()).user,owner:'forged-owner'}})).toString('base64url');
 const tampered=await request('/api/library',{headers:{cookie:`${accessName}=${prefix}.${tamperedPayload}.${signature}`}});assert.equal(tampered.status,401);proofFree(tampered,'tampered token rejection');
 assert.equal((await t.mf.dispatchFetch(t.origin+'/api/library',{headers:{'x-hana-identity':t.owner,'x-hana-user':t.owner}})).status,401);

 // Logout revokes proof immediately. Still-valid signed access remains usable
 // on ordinary routes until its 15-minute expiry; sensitive operations fail.
 const accessOnly={[accessName]:signed};
 const logout=await request('/api/session',{method:'DELETE'},accessOnly);assert.equal(logout.status,200);assert.ok(queries(logout)>0,'logout stays D1-backed');
 const afterLogout=await request('/api/library',{},accessOnly);assert.equal(afterLogout.status,200);proofFree(afterLogout,'post-logout signed read');
 const afterLogoutMembers=await request('/api/members',{},accessOnly);assert.equal(afterLogoutMembers.status,200);proofFree(afterLogoutMembers,'post-logout signed admin read');
 const uploadAfterLogout=await request('/api/library?folder=fixture&filename=after-logout.png',{method:'POST',body:png},accessOnly);
 assert.equal(uploadAfterLogout.status,201,await uploadAfterLogout.clone().text());proofFree(uploadAfterLogout,'post-logout signed write');
 const patchAfterLogout=await request('/api/folders',{method:'PATCH',headers:json,body:JSON.stringify({id:'fixture',revision:2,remarks:'still valid',buildingDetails:'',surveyStatus:'완료'})},accessOnly);
 assert.equal(patchAfterLogout.status,200,await patchAfterLogout.clone().text());proofFree(patchAfterLogout,'post-logout signed PATCH');
 const sensitiveAfterLogout=await request('/api/members',{method:'POST',headers:json,body:JSON.stringify({username:'rejected-user',displayName:'Rejected',password:'synthetic-worker-password-12345'})},accessOnly);
 assert.equal(sensitiveAfterLogout.status,401);proofRequired(sensitiveAfterLogout,'post-logout member mutation');
 const aliasMutation=await request('/api//members',{method:'POST',headers:json,body:JSON.stringify({username:'alias-user',displayName:'Alias',password:'synthetic-worker-password-12345'})},accessOnly);
 proofRequired(aliasMutation,'post-logout canonical member alias');
 const expiredAfterLogout={...accessOnly,[accessName]:expiredAccess(signed,t.adminKey)};
 assert.equal((await request('/api/library',{},expiredAfterLogout)).status,401,'expired signed access is rejected after logout');
 const refreshAfterLogout=await request('/api/session/refresh',{method:'POST'},adminJar);assert.equal(refreshAfterLogout.status,401);assert.ok(queries(refreshAfterLogout)>0);
 console.log('PASS: ordinary signed APIs avoid proof queries; sensitive mutations, refresh, revocation, legacy, expiry, tampering, scope and role boundaries remain enforced');
}finally{await t.close();}
