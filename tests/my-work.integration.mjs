import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
const t=await testRuntime(),json={'content-type':'application/json'},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),cookies=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const as=(cookie,path,options={})=>t.request(path,{...options,headers:{cookie,...options.headers}});
try{
 const actors=[];for(const username of ['my-work-a','my-work-b']){const member=await(await t.request('/api/members',{method:'POST',headers:json,body:JSON.stringify({username,displayName:username,password:'synthetic-mywork-password-12345'})})).json();assert.ok(member.member);const r=await t.request('/api/session',{method:'POST',headers:json,body:JSON.stringify({username,password:'synthetic-mywork-password-12345'})});assert.equal(r.status,200);actors.push({id:member.member.id,cookie:cookies(r)});}
 const [a,b]=actors;for(const id of ['photo-only','both','only-b','other-day','second-region','drawing-only'])await t.folder(id);
 await t.db.prepare("UPDATE survey_folders SET survey_date=?,region='내 보고 구역',lot='사직동 159-1',unit=id WHERE id<>'other-day'").bind(today).run();await t.db.prepare("UPDATE survey_folders SET region='추가 구역',manual_added=1 WHERE id='second-region'").run();
 assert.equal((await as(a.cookie,'/api/library?folder=photo-only&filename=my.png',{method:'POST',body:png})).status,201);
 assert.equal((await as(a.cookie,'/api/library?folder=drawing-only&kind=drawing&filename=plan.png',{method:'POST',body:png})).status,201);
 async function save(cookie,id,revision,remarks){const r=await as(cookie,'/api/folders',{method:'PATCH',headers:json,body:JSON.stringify({id,revision,remarks,buildingDetails:'1층',surveyStatus:'완료'})});assert.equal(r.status,200);}
 await save(a.cookie,'both',1,'A가 직접 작성한 결과');await save(b.cookie,'both',2,'B의 다른 조사 결과');await save(b.cookie,'only-b',1,'B 전용');await save(a.cookie,'other-day',1,'다른 조사 날짜');await save(a.cookie,'second-region',1,'A 추가 구역');
 const list=await as(a.cookie,'/api/my-work?mode=folders&limit=2');assert.equal(list.status,200,'personal work folder query exists');const page=await list.json();assert.equal(page.total,4);assert.equal(page.folders.length,2);const next=await(await as(a.cookie,'/api/my-work?mode=folders&limit=2&cursor='+encodeURIComponent(page.nextCursor))).json();assert.equal(new Set([...page.folders,...next.folders].map(f=>f.id)).size,4);assert.ok(!JSON.stringify(page).includes('B 전용'));
 const filtered=await(await as(a.cookie,'/api/my-work?mode=folders&q=추가')).json();assert.equal(filtered.folders.length,1);assert.equal(filtered.folders[0].id,'second-region');
 const report=await(await as(a.cookie,'/api/my-work?mode=report')).json();assert.equal(report.date,today);assert.equal(report.count,2);assert.equal(report.regions,2);assert.match(report.text,/A가 직접 작성한 결과/);assert.match(report.text,/A 추가 구역/);assert.match(report.text,/사직동 159-001/);assert.match(report.text,/추가일정/);assert.ok(!report.text.includes('B의 다른')&&!report.text.includes('B 전용')&&!report.text.includes('다른 조사 날짜')&&!report.text.includes('photo-only'));
 const bReport=await(await as(b.cookie,'/api/my-work?mode=report')).json();assert.match(bReport.text,/B의 다른 조사 결과/);assert.ok(!bReport.text.includes('A가 직접'));
 assert.equal((await t.mf.dispatchFetch(t.origin+'/api/my-work?mode=report')).status,401);assert.equal((await as(a.cookie,'/api/my-work?actor='+b.id)).status,400);assert.equal((await as(a.cookie,'/api/my-work?limit=101')).status,400);
 assert.equal((await as(a.cookie,'/api/folders?id=both',{method:'DELETE'})).status,200);const after=await(await as(a.cookie,'/api/my-work?mode=report')).json();assert.equal(after.count,1);assert.equal((await t.db.prepare("SELECT COUNT(*) n FROM personal_survey_records WHERE folder_id='both'").first()).n,0);
 // Use the real schedule import path and two workers, including mixed building types.
 const region='업로드 순번 검증';
 const upload=async lots=>{
  const form=new FormData();
  form.set('photo',new Blob([png],{type:'image/png'}),'일정표.png');
  form.set('schedule',JSON.stringify({region,date:today,folders:lots.map((lot,i)=>({
   lot:'테스트동 '+lot,unit:i===6?'101호':'',time:'',name:'',phones:[],address:'',notes:'',group:1,
  }))}));
  const encoded=new Response(form);
  const r=await t.request('/api/schedules',{method:'POST',headers:{'content-type':encoded.headers.get('content-type')},body:await encoded.arrayBuffer()});
  assert.equal(r.status,201,await r.clone().text());assert.equal((await r.json()).added,lots.length);
 };
 await upload([110,109,108,107,106,105,104,103,102,101]);
 const uploaded=(await t.db.prepare('SELECT id,sort_index FROM survey_folders WHERE owner=? AND region=? ORDER BY sort_index').bind(t.owner,region).all()).results;
 for(const {id,sort_index} of uploaded)await save(sort_index<5?a.cookie:b.cookie,id,1,'조사 '+(sort_index+1));
 const reportNumbers=async cookie=>{
  const r=await as(cookie,'/api/my-work?mode=report');
  assert.equal(r.status,200);
  const text=(await r.json()).text.split(region+' 현장조사 일일보고')[1];
  assert.ok(text);
  return [...text.matchAll(/^(\d+)\.테스트동 /gm)].map(match=>Number(match[1]));
 };
 assert.deepEqual(await reportNumbers(a.cookie),[1,2,3,4,5]);
 assert.deepEqual(await reportNumbers(b.cookie),[6,7,8,9,10]);
 await upload([99,98]);
 const later=await t.db.prepare('SELECT id FROM survey_folders WHERE owner=? AND region=? AND lot=?').bind(t.owner,region,'테스트동 98').first();
 await save(b.cookie,later.id,1,'조사 12');
 assert.deepEqual(await reportNumbers(b.cookie),[6,7,8,9,10,12]);
 console.log('PASS: participated folders, bounded search/pagination, today KST report, personal snapshots after coworker edits, multi-region/copy format, auth and deleted-folder cleanup');
}finally{await t.close();}
