import test from 'node:test';
import assert from 'node:assert/strict';
import {withSessionRequest,invalidateSessionLookup} from '../lib/session-context.ts';
import {lookupSession,COOKIE} from '../lib/session-lookup.ts';
test('session verification is reused only within one request, with independent concurrent identities',async()=>{
 let reads=0;let revoked=false;
 const db={prepare(){return {bind(token){return {async first(){reads++;await new Promise(resolve=>setTimeout(resolve,2));return revoked?null:{owner:token,username:'synthetic',displayName:'User',memberId:null,isAdmin:1};}};}};}};
 const a=COOKIE+'='+'a'.repeat(64),b=COOKIE+'='+'b'.repeat(64);
 const [first,second]=await Promise.all([a,b].map(cookie=>withSessionRequest(async()=>{
  const users=await Promise.all([lookupSession(db,cookie),lookupSession(db,cookie)]);
  assert.deepEqual(users[0],users[1]);await lookupSession(db,cookie);return users[0];
 })));
 assert.notEqual(first.owner,second.owner);
 assert.equal(reads,2,'one verified lookup per request, including concurrent callers');
 revoked=true;
 assert.equal(await withSessionRequest(()=>lookupSession(db,a)),null,'revocation must be observed by the next request');
 assert.equal(reads,3);
 await withSessionRequest(async()=>{await lookupSession(db,a);await lookupSession(db,b);});
 assert.equal(reads,5,'a refreshed or replaced cookie needs a new verification');
 await lookupSession(db,a);await lookupSession(db,a);
 assert.equal(reads,7,'outside the worker request scope there is no cache');
 await withSessionRequest(async()=>{
  assert.equal(await lookupSession(db,a),null);revoked=false;
  assert.equal(await lookupSession(db,a),null,'preflight result remains cached until the renewal boundary');
  invalidateSessionLookup(db);
  assert.ok(await lookupSession(db,a),'renewing the same proof invalidates the old expired result');
 });
 assert.equal(reads,9);
});
