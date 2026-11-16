import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

const t=await testRuntime();
try{
 await t.folder('edit-me');await t.folder('keep-me');
 await t.db.prepare("UPDATE survey_folders SET manual_added=1,remarks='기존 조사 비고',survey_status='완료',building_details='2층' WHERE id='edit-me'").run();
 const photo=await t.request('/api/library?folder=edit-me&filename=original.png',{method:'POST',body:png});assert.equal(photo.status,201);
 const photoId=(await photo.json()).photo.id;
 const drawing=await t.request('/api/library?folder=edit-me&filename=plan.png&kind=drawing',{method:'POST',body:png});assert.equal(drawing.status,201);
 const before=await t.db.prepare("SELECT * FROM survey_folders WHERE id='keep-me'").first();
 const input={id:'edit-me',revision:1,region:'수정 구역',date:'2026-09-24',lot:'망미동 435-1',unit:'승경빌라 402호',time:'오전중',name:'김정미A',phones:['010-0000-0001'],address:'과정로85번길 12-4',notes:'방문 전 확인'};
 const patch=(data,headers={})=>t.request('/api/schedules',{method:'PATCH',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
 const r=await patch(input);assert.equal(r.status,200);const updated=(await r.json()).folder;
 assert.equal(updated.id,'edit-me');assert.equal(updated.revision,2);assert.equal(updated.unitDisplay,input.unit);
 const folder=await t.db.prepare("SELECT * FROM survey_folders WHERE id='edit-me'").first();
 assert.equal(folder.region,input.region);assert.equal(folder.survey_date,input.date);assert.equal(folder.unit,'승경빌라402호');assert.equal(folder.time,'오전중');assert.equal(folder.name,'김정미A');
 assert.equal(folder.remarks,'기존 조사 비고');assert.equal(folder.survey_status,'완료');assert.equal(folder.building_details,'2층');assert.equal(folder.manual_added,1);
 assert.deepEqual(await t.db.prepare("SELECT * FROM survey_folders WHERE id='keep-me'").first(),before);
 assert.equal((await t.db.prepare("SELECT COUNT(*) n FROM photos WHERE folder='edit-me'").first()).n,2);
 const download=await t.request('/api/photos/'+photoId);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);
 const stale=await patch({...input,time:'아무때나'});assert.equal(stale.status,409);assert.equal((await stale.json()).latest.time,'오전중');
 const staleRemarks=await t.request('/api/folders',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:'edit-me',revision:1,remarks:'오래된 기기',buildingDetails:'',surveyStatus:'미완료'})});assert.equal(staleRemarks.status,409);
 for(const time of ['오후중','아무때나']){const res=await patch({...input,revision:++input.revision,time});assert.equal(res.status,200);assert.equal((await res.json()).folder.time,time);}
 input.revision=4;
 const duplicate=await patch({...input,region:'테스트',date:'2026-09-23',lot:'keep-me',unit:''});assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).code,'duplicate');
 for(const bad of [{date:'2026-02-30'},{lot:'../escape'},{region:''},{revision:0},{remarks:'unexpected'},{id:42}])assert.equal((await patch({...input,...bad})).status,400);
 assert.equal((await patch({...input,id:'missing'})).status,404);
 assert.equal((await patch(input,{origin:'https://elsewhere.test'})).status,403);
 assert.equal((await patch(input,{origin:''})).status,403);
 assert.equal((await patch(input,{cookie:''})).status,401);
 await t.db.prepare("UPDATE survey_folders SET owner='other-owner' WHERE id='keep-me'").run();assert.equal((await patch({...input,id:'keep-me'})).status,404);
 await t.db.prepare("UPDATE survey_folders SET deleting=1 WHERE id='edit-me'").run();assert.equal((await patch(input)).status,404);
 const {id:oldId,revision:oldRevision,region,date,...details}=input;
 const add=team=>t.request('/api/schedules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({region,date,folders:[{...details,lot:'망미동 600-1',group:1,team}]})});
 assert.equal((await add(21)).status,400);
 assert.equal((await add(2)).status,201);
 const scope=new URLSearchParams({region,date});
 async function teamPage(team){
  const response=await t.request('/api/library?'+scope+'&team='+team);
  assert.equal(response.status,200);
  return response.json();
 }
 const created=(await teamPage(2)).cards[0];
 assert.ok(created);
 const change={...details,lot:'망미동 600-1',region,date,id:created.target.folder,revision:1};
 const report=async()=>{
  const response=await t.request('/api/report?'+scope);
  assert.equal(response.status,200);
  return response.json();
 };
 assert.match((await report()).text,/B팀 현장조사 일일보고[\s\S]*추가일정/);
 await t.request('/api/folders',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:change.id,revision:1,remarks:'직접 조사한 기록',buildingDetails:'',surveyStatus:'완료'})}).then(response=>assert.equal(response.status,200));
 const personal=async()=>{
  const response=await t.request('/api/my-work?mode=report&'+scope);
  assert.equal(response.status,200);
  return response.json();
 };
 assert.match((await personal()).text,/B팀 현장조사 일일보고[\s\S]*직접 조사한 기록/);
 const shifted=await patch({...change,revision:2,team:1});
 assert.equal(shifted.status,200);assert.equal((await shifted.json()).folder.team,1);
 assert.equal((await teamPage(2)).cards.length,0);
 assert.equal((await teamPage(1)).cards[0].target.folder,change.id);
 assert.match((await personal()).text,/A팀 현장조사 일일보고[\s\S]*직접 조사한 기록/);
 const legacyEdit=await patch({...change,revision:3,time:'15:00'});
 assert.equal(legacyEdit.status,200);assert.equal((await legacyEdit.json()).folder.team,1);
 const cleared=await patch({...change,revision:4,team:null});
 assert.equal(cleared.status,200);assert.equal((await cleared.json()).folder.team,undefined);
 const unassigned=await teamPage(0);
 assert.equal(unassigned.cards[0].target.folder,change.id);
 assert.equal(unassigned.totalCards,1);
 assert.doesNotMatch((await report()).text,/[AB]팀 현장조사 일일보고/);
 console.log('PASS: schedule edits preserve files and records, and manual team changes update folder lists and reports');
}finally{await t.close();}
