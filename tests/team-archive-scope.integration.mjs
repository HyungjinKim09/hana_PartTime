import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

const t=await testRuntime();
const date='2026-11-12',region='팀 아카이브 검증';
const exportRequest=params=>t.request('/api/export?'+new URLSearchParams(params),{method:'POST'});
const archive=async params=>{
 const response=await exportRequest(params);
 assert.equal(response.status,200,await response.clone().text());
 return response.json();
};
try{
 const fixtures=[['team1-photo',1],['team1-empty',1],['team2-photo',2],['unassigned-photo',null]];
 for(const [id,team] of fixtures){
  await t.folder(id);
  await t.db.prepare('UPDATE survey_folders SET region=?,survey_date=?,schedule_team=? WHERE owner=? AND id=?').bind(region,date,team,t.owner,id).run();
 }
 for(const id of ['team1-photo','team2-photo','unassigned-photo']){
  const response=await t.request('/api/library?'+new URLSearchParams({folder:id,filename:id+'.png'}),{method:'POST',body:png});
  assert.equal(response.status,201,await response.clone().text());
 }

 const common={view:'date',region,date};
 const team1=await archive({...common,team:'1'});
 assert.equal(team1.entries.filter(entry=>entry.url!==null).length,1);
 assert.ok(team1.entries.filter(entry=>entry.url===null).some(entry=>entry.name.includes('team1-photo')));
 assert.equal(team1.entries.filter(entry=>entry.url===null).length,2,'team 1 includes both its photo and empty schedule folders');
 const unassigned=await archive({...common,team:'0'});
 assert.equal(unassigned.entries.filter(entry=>entry.url!==null).length,1);
 assert.equal(unassigned.entries.filter(entry=>entry.url===null).length,1,'team=0 selects only explicitly unassigned schedules');
 const all=await archive(common);
 assert.equal(all.entries.filter(entry=>entry.url!==null).length,3);
 assert.equal(all.entries.filter(entry=>entry.url===null).length,4,'omitting team includes every team and unassigned schedules');
 const photosOnly=await archive({...common,team:'1',photosOnly:'1'});
 assert.equal(photosOnly.entries.filter(entry=>entry.url!==null).length,1);
 assert.equal(photosOnly.entries.filter(entry=>entry.url===null).length,1);

 const previewResponse=await exportRequest({...common,team:'1',preview:'1',photosOnly:'1'});
 assert.equal(previewResponse.status,200,await previewResponse.clone().text());
 const preview=await previewResponse.json();
 assert.deepEqual(preview,{schedules:2,fieldPhotos:1,withFieldPhotos:1,fieldBytes:png.length});
 const allPreview=await (await exportRequest({...common,preview:'1'})).json();
 assert.deepEqual(allPreview,{schedules:4,fieldPhotos:3,withFieldPhotos:3,fieldBytes:png.length*3});
 const unassignedPreview=await (await exportRequest({...common,team:'0',preview:'1'})).json();
 assert.deepEqual(unassignedPreview,{schedules:1,fieldPhotos:1,withFieldPhotos:1,fieldBytes:png.length});

 const ticketCount=async()=>Number((await t.db.prepare('SELECT COUNT(*) n FROM r2_download_tickets').first()).n);
 const before=ticketCount();
 for(const params of [
  {...common,team:'21'},
  {view:'date',region,team:'1'},
  {view:'date',date,team:'1'},
  {...common,team:'1',folder:'team1-photo'},
  {region,view:'address',team:'1'},
 ]){
  const response=await exportRequest(params);
  assert.equal(response.status,400,JSON.stringify(params));
 }
 assert.equal(await ticketCount(),await before,'Invalid team archive scopes must not issue download tickets');

 const searchAll=await(await t.request('/api/library?q=가상자료&view=date&region='+encodeURIComponent(region)+'&date='+date)).json();
 assert.equal(searchAll.cards.length,4,'omitted team searches schedules across teams');
 const searchTeam=await(await t.request('/api/library?'+new URLSearchParams({q:'가상자료',view:'date',region,date,team:'1'}))).json();
 assert.equal(searchTeam.cards.length,2,'numeric team restricts search to that team');
 assert.ok(searchTeam.cards.every(card=>card.team===1));
 console.log('PASS: date archive team scope, explicit unassigned scope, validation, preview counts and team-aware library search');
}finally{await t.close();}
