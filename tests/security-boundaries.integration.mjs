import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
const t=await testRuntime();
try{
 await t.folder();await t.request('/api/library?folder=fixture',{method:'POST',body:png});
 const reads=async()=>Number((await t.db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM r2_operation_usage WHERE kind='read'").first()).n);
 const tickets=async()=>Number((await t.db.prepare('SELECT COUNT(*) AS n FROM r2_download_tickets').first()).n);
 for(const options of [{},{method:'HEAD'},{method:'POST',headers:{origin:'https://outside.test'}},{method:'POST',headers:{origin:'null'}},{method:'POST',headers:{origin:''}},{method:'POST',headers:{'sec-fetch-site':'cross-site'}}]){
  const result=await t.request('/api/export',options);assert.ok([403,405].includes(result.status),String(result.status));assert.equal(await reads(),0);assert.equal(await tickets(),0);
 }
 const manifest=await t.request('/api/export',{method:'POST'});assert.equal(manifest.status,200);const data=await manifest.json();assert.equal(data.files,1);assert.equal(await reads(),0,'unused tickets do not charge reads');
 const url=data.entries.find(e=>e.url).url;assert.equal((await t.request(url)).status,200);assert.equal(await reads(),1);assert.equal((await t.request(url)).status,410);assert.equal(await reads(),1);
 console.log('PASS: export safe methods/origins, unused tickets, legitimate download and single use');
}finally{await t.close();}
