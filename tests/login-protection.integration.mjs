import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';

let verificationCalls=0;
const t=await testRuntime({
 bindings:{TURNSTILE_SITE_KEY:'synthetic-site-key',TURNSTILE_SECRET:'synthetic-verification-secret'},
 outboundService:async request=>{
  verificationCalls++;
  assert.equal(request.url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(request.method,'POST');
  const form=await request.formData();
  assert.equal(form.get('secret'),'synthetic-verification-secret');
  const token=form.get('response');
  if(token==='unavailable')return new Response(null,{status:502});
  return Response.json({success:token!=='invalid',hostname:token==='wrong-host'?'elsewhere.test':'hana.test',action:token==='wrong-action'?'other':'login'});
 },
 entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
 export default {fetch(request,env,ctx){
  let reads=0;let prepares=0;
  const db=new Proxy(env.DB,{get(target,key){if(key==='prepare')return sql=>{prepares++;if(sql.includes('FROM site_account WHERE id=1'))reads++;return target.prepare(sql);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  const bindings={...env,DB:db};
  return withEnv(bindings,async()=>{const result=await worker.fetch(request,bindings,ctx);const response=new Response(result.body,result);response.headers.set('x-test-d1',String(prepares));response.headers.set('x-test-account',String(reads));return response;});
 }};`
});
const good='synthetic-password-12345';
const login=(username,password,token,ip='192.0.2.15',path='/api/session')=>t.request(path,{method:'POST',headers:{cookie:'','content-type':'application/json','cf-connecting-ip':ip,...(token?{'x-hana-turnstile':token}:{})},body:JSON.stringify({username,password})});
try{
 for(const [token,expected] of [[null,403],['invalid',403],['wrong-host',403],['wrong-action',403],['unavailable',503]]){
  const r=await login('synthetic',good,token);
  assert.equal(r.status,expected);assert.equal(r.headers.get('x-test-d1'),'0');
 }
 assert.equal(verificationCalls,4);
 assert.equal((await login('synthetic',good,null,'192.0.2.15','/api//session')).headers.get('x-test-d1'),'0');
 const loginPage=await t.request('/',{headers:{cookie:''}});
 const markup=await loginPage.text();assert.ok(markup.includes('synthetic-site-key'));assert.ok(!markup.includes('synthetic-verification-secret'));
 for(let i=0;i<5;i++){
  const failed=await login(i%2?'SYNTHETIC':'synthetic','incorrect-password-123','valid','192.0.2.'+(20+i));
  assert.equal(failed.status,401);
 }
 const blocked=await login('synthetic',good,'valid','192.0.2.26');
 assert.equal(blocked.status,429);assert.equal(blocked.headers.get('x-test-account'),'0');
 const delay=Number(blocked.headers.get('retry-after'));assert.ok(delay>0&&delay<=30);
 const state=await t.db.prepare('SELECT failures,blocked_until FROM site_account_login_limits').first();
 assert.equal(state.failures,5);
 await t.db.prepare('UPDATE site_account_login_limits SET blocked_until=0').run();
 assert.equal((await login('synthetic','incorrect-password-123','valid','192.0.2.27')).status,401);
 const next=await login('synthetic',good,'valid','192.0.2.28');
 assert.equal(next.status,429);assert.ok(Number(next.headers.get('retry-after'))>30);
 await t.db.prepare('UPDATE site_account_login_limits SET blocked_until=0').run();
 assert.equal((await login('synthetic',good,'valid')).status,200);
 assert.equal(await t.db.prepare('SELECT failures FROM site_account_login_limits').first(),null);
 assert.equal((await login('synthetic','incorrect-password-123','valid')).status,401);
 assert.equal((await t.db.prepare('SELECT failures FROM site_account_login_limits').first()).failures,1);
 console.log('PASS: Turnstile verifies before D1, account failures aggregate across IP/case, and backoff grows and resets');
}finally{await t.close();}
