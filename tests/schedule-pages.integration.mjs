import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

const t=await testRuntime();
const region='가상 다중 일정표',date='2026-11-07';
const sources=[png,Buffer.concat([png,Buffer.from('second-original')])];
const folders=Array.from({length:13},(_,i)=>({lot:`가상동 321-${i+1}`,unit:'',time:'10:00',name:'',phones:[],address:'',notes:i===0?'긴 비고\n추가 줄':'',group:i<8?1:2}));
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
 const records=await t.db.prepare('SELECT lot,notes,schedule_team AS team FROM survey_folders WHERE owner=? AND region=? AND survey_date=? ORDER BY sort_index').bind(t.owner,region,date).all();
 assert.deepEqual(records.results,folders.map(({lot,notes,group})=>({lot,notes,team:group})));
 const scope=new URLSearchParams({region,date});
 for(const [team,count,firstLot] of [['first',8,'321-1'],['2',5,'321-9']]){
  const page=await (await t.request('/api/library?'+scope+'&team='+team+'&limit=2')).json();
  assert.deepEqual(page.teams,[{team:1,count:8},{team:2,count:5}]);
  assert.equal(page.totalCards,count);
  assert.equal(page.cards.length,2);
  assert.ok(page.cards[0].label.endsWith(firstLot));
  assert.equal(page.nextFoldersCursor,'2');
  const next=await (await t.request('/api/library?'+scope+'&team='+team+'&limit=2&foldersCursor='+page.nextFoldersCursor)).json();
  assert.ok(next.cards.every(card=>!page.cards.some(first=>first.key===card.key)));
 }
 const report=await (await t.request('/api/report?'+scope)).json();
 assert.deepEqual(report.sections.map(({team,count})=>[team,count]),[[1,8],[2,5]]);
 assert.match(report.text,/A팀 현장조사 일일보고[\s\S]*이상입니다\.[\s\S]*B팀 현장조사 일일보고\n\n1\.가상동 321-009/);
 const target=await t.db.prepare('SELECT id FROM survey_folders WHERE owner=? AND region=? AND sort_index=10').bind(t.owner,region).first();
 const saved=await t.request('/api/folders',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:target.id,revision:1,remarks:'',buildingDetails:'1동 2층',surveyStatus:'완료'})});
 assert.equal(saved.status,200);
 const personal=await (await t.request('/api/my-work?mode=report&'+scope)).json();
 assert.deepEqual(personal.sections.map(({team,count})=>[team,count]),[[2,1]]);
 assert.equal(personal.text,'11/7(토) 가상 다중 일정표 B팀 현장조사 일일보고\n\n3.가상동 321-011 - 완료/1동 2층/특이사항 없음\n\n이상입니다.');
 const credentials={username:'team-a-worker',password:'synthetic-team-a-12345'};
 const headers={'content-type':'application/json'};
 const member=await t.request('/api/members',{method:'POST',headers,body:JSON.stringify({...credentials,displayName:'A팀 테스트'})});
 assert.equal(member.status,201);
 const login=await t.request('/api/session',{method:'POST',headers,body:JSON.stringify(credentials)});
 assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const teamA=await t.db.prepare('SELECT id FROM survey_folders WHERE owner=? AND region=? AND sort_index=2').bind(t.owner,region).first();
 const savedA=await t.request('/api/folders',{method:'PATCH',headers:{...headers,cookie},body:JSON.stringify({id:teamA.id,revision:1,remarks:'A팀 조사 기록',buildingDetails:'',surveyStatus:'완료'})});
 assert.equal(savedA.status,200);
 const personalA=await (await t.request('/api/my-work?mode=report&'+scope,{headers:{cookie}})).json();
 assert.deepEqual(personalA.sections.map(({team,count})=>[team,count]),[[1,1]]);
 assert.match(personalA.text,/^3\.가상동 321-003 - 완료\/A팀 조사 기록$/m);
 const personalB=await (await t.request('/api/my-work?mode=report&'+scope)).json();
 assert.equal(personalB.text,personal.text);
 console.log('PASS: one dated import retains 13 ordered schedules and their teams, both originals and multiline notes; invalid second page leaves no sources');
}finally{await t.close();}
