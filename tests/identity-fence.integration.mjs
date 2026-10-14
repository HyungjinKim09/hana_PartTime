import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
const t=await testRuntime();
try{
 const created=await t.request('/api/members',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'new-actor',displayName:'다른 작업자',password:'synthetic-personal-password-12345'})});assert.equal(created.status,201);const member=(await created.json()).member;
 const login=await t.mf.dispatchFetch(t.origin+'/api/session',{method:'POST',headers:{origin:t.origin,'content-type':'application/json'},body:JSON.stringify({username:member.username,password:'synthetic-personal-password-12345'})});const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 await t.folder('identity-fixture');
 const as=(path,options={})=>t.request(path,{...options,headers:{cookie,'x-hana-identity':t.owner,...options.headers}});
 const wrong=await as('/api/library?folder=identity-fixture&filename=stale.png',{method:'POST',body:png});assert.equal(wrong.status,409,'old administrator tab cannot upload under another person');assert.equal((await wrong.json()).code,'identity_changed');
 assert.equal((await as('/api/library')).status,409);assert.equal((await as('/api/session',{method:'DELETE'})).status,409,'stale tab cannot log out the new account');
 const identity=await t.request('/api/identity',{headers:{cookie}});assert.equal(identity.status,200);assert.equal((await identity.json()).scope,t.owner+'/'+member.id);
 assert.equal((await as('/api/library',{headers:{'x-hana-identity':t.owner+'/'+member.id}})).status,200);assert.equal((await t.db.prepare('SELECT COUNT(*) n FROM photos').first()).n,0);
 console.log('PASS: stale-tab read/write/logout fencing and verified personal scope');
}finally{await t.close();}
