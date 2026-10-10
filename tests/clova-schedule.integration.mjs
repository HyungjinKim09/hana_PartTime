import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
import {ocrMonth} from '../lib/clova-schedule.ts';
const cell=(rowIndex,columnIndex,text)=>({rowIndex,columnIndex,cellTextLines:[{cellWords:[{inferText:text}]}]});
const result={images:[{inferResult:'SUCCESS',fields:[{inferText:'망미5구역 2026년 9월 15일'}],tables:[{cells:[...['번호','번지','성명','연락처','시간','비고(새주소)'].map((s,i)=>cell(0,i,s)),...['1','망미동 937-29','김정미A','010-1234-5678','오전중','SKY빌라 B동 402호','방문 전 연락'].map((s,i)=>cell(1,i,s))]}]}]};
let calls=0,fail=false;
const t=await testRuntime({bindings:{CLOVA_OCR_URL:'https://synthetic.apigw.ntruss.com/general',CLOVA_OCR_SECRET:'synthetic-secret'},outboundService:async request=>{
 calls++;assert.equal(request.url,'https://synthetic.apigw.ntruss.com/general');assert.equal(request.headers.get('X-OCR-SECRET'),'synthetic-secret');
 const form=await request.formData(),message=JSON.parse(form.get('message'));assert.equal(message.enableTableDetection,true);assert.equal(message.lang,'ko');assert.equal(message.images.length,1);assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()),png);
 return fail?new Response('private upstream error',{status:500}):Response.json(result);
}});
const endpoint='/api/schedules/recognize',send=(headers={})=>t.request(endpoint,{method:'POST',body:png,headers});
try{
 assert.equal((await send({cookie:''})).status,401);assert.equal((await send({origin:'https://evil.test'})).status,403);
 assert.equal((await t.request(endpoint,{method:'POST',body:'bad'})).status,415);assert.equal(calls,0);
 assert.equal((await t.request(endpoint)).status,200);
 const r=await send();assert.equal(r.status,200,await r.clone().text());const data=await r.json();assert.equal(data.remaining,99);assert.equal(data.draft.folders[0].name,'김정미A');assert.equal(data.draft.folders[0].time,'오전중');
 fail=true;assert.equal((await send()).status,502);assert.equal((await (await t.request(endpoint)).json()).used,2);fail=false;
 await t.db.prepare('UPDATE schedule_ocr_usage SET requests=99 WHERE month=?').bind(ocrMonth()).run();
 const results=await Promise.all(Array.from({length:6},()=>send()));assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===429).length,5);assert.equal(calls,3);
 const final=await (await t.request(endpoint)).json();assert.equal(final.used,100);assert.equal(final.remaining,0);assert.ok(!JSON.stringify(final).includes('secret'));
 await t.db.prepare('UPDATE schedule_ocr_usage SET month=? WHERE month=?').bind('2000-01',ocrMonth()).run();
 assert.equal((await send()).status,200);assert.equal((await (await t.request(endpoint)).json()).used,1);
 console.log('PASS: CLOVA mocked request contract, auth/origin/type checks, mixed-language table, failed calls charged, atomic monthly cap across concurrent requests');
}finally{await t.close();}
const unconfigured=await testRuntime();
try{assert.deepEqual(await (await unconfigured.request(endpoint)).json(),{available:false});assert.equal((await unconfigured.request(endpoint,{headers:{cookie:''}})).status,401);assert.equal((await unconfigured.request(endpoint,{method:'POST',body:png})).status,503);}finally{await unconfigured.close();}
