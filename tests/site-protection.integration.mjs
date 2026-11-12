import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';

const t=await testRuntime({entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
export default {fetch(request,env,ctx){
 let prepares=0,selected='';
 const db=new Proxy(env.DB,{get(target,key){if(key==='prepare')return sql=>{prepares++;return target.prepare(sql);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const bindings={...env,DB:db};
 const deny=request.headers.get('x-test-rate')==='deny';
 for(const name of ['SITE_PAGE_IP','SITE_API_IP','SITE_MEDIA_IP']){
  bindings[name]={async limit({key}){selected=name+':'+key;return {success:!deny};}};
 }
 return withEnv(bindings,async()=>{
  const response=await worker.fetch(request,bindings,ctx);
  const result=new Response(response.body,response);
  result.headers.set('x-test-d1',String(prepares));
  result.headers.set('x-test-limiter',selected);
  return result;
 });
}};`});
try{
 const headers={'cf-connecting-ip':'192.0.2.15','x-test-rate':'deny'};
 for(const [path,bucket] of [['/','SITE_PAGE_IP'],['/account/setup','SITE_PAGE_IP'],['/api/library','SITE_API_IP'],['/%61pi//library.rsc','SITE_API_IP'],['/api/photos/photo-a','SITE_MEDIA_IP'],['/api/export/ticket-a','SITE_MEDIA_IP']]){
  const r=await t.request(path,{headers});
  assert.equal(r.status,429,path);assert.equal(r.headers.get('x-test-d1'),'0',path);
  assert.equal(r.headers.get('retry-after'),'60',path);
  assert.match(r.headers.get('x-test-limiter'),new RegExp('^'+bucket+':.*192[.]0[.]2[.]15$'),path);
 }
 const html=await t.request('/',{headers:{cookie:''}});assert.equal(html.status,200);
 assert.equal(html.headers.get('x-frame-options'),'DENY');
 assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.match(html.headers.get('strict-transport-security'),/max-age=\d+/);
 const library=await t.request('/api/library');assert.equal(library.status,200);
 assert.equal(library.headers.get('content-security-policy'),null);
 console.log('PASS: public pages, general APIs and media have independent early request limits; login HTML cannot be framed');
}finally{await t.close();}
