import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

const t=await testRuntime();
const region='가상 다중 일정표',date='2026-11-07';
const sources=[png,Buffer.concat([png,Buffer.from('second-original')])];
const folders=Array.from({length:13},(_,i)=>({lot:`가상동 321-${i+1}`,unit:'',time:'10:00',name:'',phones:[],address:'',notes:i===0?'긴 비고\n추가 줄':'',group:1}));
async function request(images){
 const form=new FormData();
 images.forEach((bytes,index)=>form.append('photo',new Blob([bytes],{type:'image/png'}),`page-${index+1}.png`));
 form.set('schedule',JSON.stringify({region,date,folders}));
 const encoded=new Response(form);
 return t.request('/api/schedules',{method:'POST',headers:{'content-type':encoded.headers.get('content-type')},body:await encoded.arrayBuffer()});
}
try{
 const invalid=await request([sources[0],Buffer.from('invalid image')]);
 assert.equal(invalid.status,415);
 const bucket=await t.mf.getR2Bucket('BUCKET');
 assert.equal((await bucket.list({prefix:t.owner+'/schedules/'})).objects.length,0);
 const response=await request(sources);
 assert.equal(response.status,201,await response.clone().text());
 assert.equal((await response.json()).added,13);
 const original=await t.db.prepare('SELECT filename,object_key FROM schedule_imports WHERE owner=? AND region=? AND survey_date=? ORDER BY filename').bind(t.owner,region,date).all();
 assert.deepEqual(original.results.map(row=>row.filename),['page-1.png','page-2.png']);
 for(const [i,row] of original.results.entries())assert.deepEqual(Buffer.from(await (await bucket.get(row.object_key)).arrayBuffer()),sources[i]);
 const records=await t.db.prepare('SELECT lot,notes FROM survey_folders WHERE owner=? AND region=? AND survey_date=? ORDER BY sort_index').bind(t.owner,region,date).all();
 assert.deepEqual(records.results,folders.map(({lot,notes})=>({lot,notes})));
 console.log('PASS: one dated import retains 13 ordered schedules, both originals and multiline notes; invalid second page leaves no sources');
}finally{await t.close();}
