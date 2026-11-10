import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
const t=await testRuntime(),headers={'content-type':'application/json'};
const send=(path,value,method='POST',extra={})=>t.request(path,{method,headers:{...headers,...extra},body:JSON.stringify(value)});
const cookie=r=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
try{
 for(const id of ['legacy-crew','photos-a','photos-b','empty'])await t.folder(id);
 const people=[];for(const [username,displayName]of [['operations-a','작업자 A'],['operations-b','작업자 B']]){const r=await send('/api/members',{username,displayName,password:'synthetic-operations-password'});assert.equal(r.status,201);people.push((await r.json()).member);}
 const [a,b]=people,login=await send('/api/session',{username:a.username,password:'synthetic-operations-password'});assert.equal(login.status,200);const worker=cookie(login);
 const initial=await t.request('/api/folder-participants?folder=legacy-crew');assert.equal(initial.status,200,'administrator can assign people to an existing folder');
 assert.equal((await send('/api/folder-participants',{folder:'legacy-crew',revision:1,ids:[a.id,b.id]},'PATCH',{cookie:worker})).status,403);
 assert.equal((await send('/api/folder-participants',{folder:'legacy-crew',revision:1,ids:[a.id,b.id]},'PATCH')).status,200);
 let detail=await(await t.request('/api/library?folder=legacy-crew')).json();assert.deepEqual(detail.summary.participants.map(p=>p.name).sort(),['작업자 A','작업자 B']);assert.ok(detail.summary.participants.every(p=>p.manual));
 assert.equal((await send('/api/folder-participants',{folder:'legacy-crew',revision:1,ids:[]},'PATCH')).status,409);
 assert.equal((await send('/api/folder-participants',{folder:'legacy-crew',revision:2,ids:['foreign-member']},'PATCH')).status,400);
 assert.equal((await send('/api/folder-participants',{folder:'legacy-crew',revision:2,ids:[a.id]},'PATCH',{origin:'https://other.test'})).status,403);
 const uploaded=await t.request('/api/library?folder=legacy-crew&filename=crew.png',{method:'POST',headers:{cookie:worker},body:png});assert.equal(uploaded.status,201);
 assert.equal((await send('/api/folder-participants',{folder:'legacy-crew',revision:2,ids:[]},'PATCH')).status,200);
 detail=await(await t.request('/api/library?folder=legacy-crew')).json();assert.deepEqual(detail.summary.participants.map(p=>p.id),[a.id]);assert.equal(detail.summary.participants[0].manual,undefined,'removing a manual choice keeps actual work');
 assert.equal((await t.db.prepare('SELECT count(*) n FROM personal_survey_records').first()).n,0,'manual assignment does not forge survey results');
 for(const id of ['photos-a','photos-b'])assert.equal((await t.request('/api/library?folder='+id+'&filename=photo.png',{method:'POST',body:png})).status,201);
 assert.equal((await t.request('/api/library?folder=empty&kind=drawing&filename=drawing.png',{method:'POST',body:png})).status,201);
 const exported=await t.request('/api/export?region=테스트&photosOnly=1&track=1',{method:'POST'});assert.equal(exported.status,200);const manifest=await exported.json();assert.match(manifest.downloadReceipt,/^[a-f0-9-]{36}$/);
 assert.equal((await(await t.request('/api/library?folder=photos-a')).json()).summary.downloaded,0,'export alone never marks completion');
 const confirmed=await send('/api/folder-downloads',{receipts:[manifest.downloadReceipt]});assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).marked,3);
 detail=await(await t.request('/api/library?folder=photos-a')).json();assert.equal(detail.summary.downloaded,1);assert.equal(detail.folders[0].downloadedBy.id,'admin');
 assert.equal((await(await t.request('/api/library?folder=empty')).json()).summary.downloaded,0,'drawing and empty folders are never marked');
 assert.equal((await send('/api/folder-downloads',{receipts:[crypto.randomUUID()]})).status,410);
 assert.equal((await send('/api/folder-downloads',{receipts:[manifest.downloadReceipt]},'POST',{origin:'https://other.test'})).status,403);
 const version=detail.folders[0].downloadRevision;assert.equal((await send('/api/folder-downloads',{folder:'photos-a',revision:version},'DELETE',{cookie:worker})).status,200);
 assert.equal((await send('/api/folder-downloads',{folder:'photos-a',revision:version},'DELETE')).status,409);
 const current=await t.request('/api/export?folder=photos-a&track=1',{method:'POST'}),receipt=(await current.json()).downloadReceipt;
 assert.equal((await t.request('/api/library?folder=photos-a&filename=new.png',{method:'POST',body:png})).status,201);
 assert.equal((await send('/api/folder-downloads',{receipts:[receipt]})).status,409,'photos added after ZIP preparation cannot be marked');
 const fresh=(await(await t.request('/api/export?folder=photos-a&track=1',{method:'POST'})).json()).downloadReceipt;
 assert.equal((await send('/api/folder-downloads',{receipts:[fresh]},'POST',{cookie:worker})).status,200);
 detail=await(await t.request('/api/library?folder=photos-a')).json();assert.equal(detail.summary.downloaded,1);assert.equal(detail.folders[0].downloadedBy.id,a.id);
 assert.equal((await t.request('/api/library?folder=photos-a&filename=changed.png',{method:'POST',body:png})).status,201);detail=await(await t.request('/api/library?folder=photos-a')).json();assert.equal(detail.summary.downloaded,0);assert.ok(detail.folders[0].downloadedBy);
 await t.folder('split');const bucket=await t.mf.getR2Bucket('BUCKET');
 for(let n=0;n<2;n++){await bucket.put('split-'+n,png);await t.db.prepare("INSERT INTO photos(id,owner,folder,filename,object_key,content_type,size,created_at,kind) VALUES(?,?,'split',?,?,'image/png',157286400,?,'photo')").bind('split-'+n,t.owner,n+'.png','split-'+n,new Date().toISOString()).run();}
 const plan=await(await t.request('/api/export?folder=split&parts=1',{method:'POST'})).json(),receipts=[];assert.equal(plan.parts.length,2);
 for(const part of plan.parts){const data=await(await t.request('/api/export?'+new URLSearchParams({folder:'split',part:String(part.index),snapshot:plan.snapshot,track:'1'}),{method:'POST'})).json();receipts.push(data.downloadReceipt);}
 assert.equal((await send('/api/folder-downloads',{receipts:[receipts[0]]})).status,409,'one part cannot complete a split folder');assert.equal((await send('/api/folder-downloads',{receipts})).status,200);
 assert.equal((await t.mf.dispatchFetch(t.origin+'/api/folder-participants?folder=legacy-crew')).status,401);assert.equal((await t.mf.dispatchFetch(t.origin+'/api/folder-downloads',{method:'POST',headers:{origin:t.origin,...headers},body:JSON.stringify({receipts})})).status,401);
 const events=await(await t.request('/api/activity')).json();assert.ok(events.entries.some(e=>e.action==='folder.participants'));assert.ok(events.entries.some(e=>e.action==='photos.download_confirmed'));
 console.log('PASS: admin manual investigators, actual-worker preservation, no forged reports, explicit shared ZIP completion, parts coverage, revisions, new photos, owner/origin/auth boundaries');
}finally{await t.close();}
