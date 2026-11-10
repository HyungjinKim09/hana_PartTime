import test from 'node:test';
import assert from 'node:assert/strict';
import {authIngress} from '../lib/auth-ingress.ts';
const url='https://hana.test',request=(path='/api/session',extra={})=>new Request(url+path,{method:'POST',headers:{origin:url,'cf-connecting-ip':'192.0.2.7',...extra.headers},...extra});
function bindings(allow=true){const calls=[];const limit={async limit({key}){calls.push(key);return {success:allow};}};return {calls,env:{AUTH_LOGIN_IP:limit,AUTH_LOGIN_TOTAL:limit,AUTH_SESSION_IP:limit,AUTH_SESSION_TOTAL:limit}};}
test('rate protection classifies auth representations into stable shared buckets',async()=>{
 const {calls,env}=bindings();
 for(const path of ['/api/session','/api//session','/api/session/','/api/session.rsc','/api/%73ession','/%61pi/session','/api/account?nonce=change'])assert.equal(await authIngress(request(path),env),null);
 assert.deepEqual([...new Set(calls)],['hana:login:192.0.2.7','hana:login:all']);
 const logout=await authIngress(request('/api/session',{method:'DELETE'}),env);assert.equal(logout,null);assert.ok(calls.includes('hana:session:all'));
 assert.equal(await authIngress(request('/api/library?folder=photo'),{}),null,'normal APIs have no credential throttle');
});
test('rejection, missing binding, backend error and origin/method checks fail before auth dispatch',async()=>{
 const {calls,env}=bindings(false);const rejected=await authIngress(request(),env);assert.equal(rejected.status,429);assert.equal(rejected.headers.get('retry-after'),'60');assert.equal(calls.length,1);
 assert.equal((await authIngress(request(),{})).status,503);
 const broken={async limit(){throw Error('synthetic unavailable');}};
 assert.equal((await authIngress(request(),{AUTH_LOGIN_IP:broken,AUTH_LOGIN_TOTAL:broken})).status,503);
 const before=calls.length;
 assert.equal((await authIngress(request('/api/session',{headers:{origin:'https://evil.test','sec-fetch-site':'cross-site'}}),env)).status,403);
 assert.equal((await authIngress(request('/api/session',{method:'GET'}),env)).status,405);
 assert.equal(calls.length,before);
});
