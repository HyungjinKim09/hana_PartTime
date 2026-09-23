import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
import {validateBackup,backupPath,sha256} from '../lib/backup-format.ts';
const t=await testRuntime(),post=async data=>t.request('/api/restore',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
try{
 await t.folder();
 await t.db.prepare("UPDATE survey_folders SET remarks='보존할 비고',survey_status='완료',building_details='일반건물' WHERE id='fixture'").run();
 const photo=await t.request('/api/library?folder=fixture&kind=drawing&filename=synthetic.png',{method:'POST',body:png});assert.equal(photo.status,201);const p=(await photo.json()).photo;
 const draft={version:1,widthMeters:10,heightMeters:6,lines:[{id:'wall',a:{x:0,y:0},b:{x:1000,y:0},dashed:false}],labels:[{id:'label',x:200,y:200,text:'창고'}],warnings:[]};
 await t.db.prepare('INSERT INTO drawing_drafts VALUES(?,?,?,?,?)').bind(p.id,t.owner,JSON.stringify(draft),3,new Date().toISOString()).run();
 const source='synthetic-source';await (await t.mf.getR2Bucket('BUCKET')).put('fixture-source',png);
 await t.db.prepare('INSERT INTO schedule_imports(id,owner,filename,object_key,content_type,size,draft,region,survey_date,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(source,t.owner,'source.png','fixture-source','image/png',png.length,'{"folders":[]}','테스트','2026-09-23',new Date().toISOString()).run();
 const response=await t.request('/api/backup');assert.equal(response.status,200);const catalog=await response.json();
 const files=[...catalog.photos.map(p=>({kind:'photo',...p})),...catalog.sources.map(s=>({...s,kind:'schedule'}))].map(p=>({kind:p.kind==='schedule'?'schedule':'photo',id:p.id,path:backupPath(p.kind==='schedule'?'schedule':'photo',p.id,p.content_type),size:p.size,sha256:''}));
 for(const f of files){const ticket=await t.request('/api/backup',{method:'POST',body:JSON.stringify({kind:f.kind,id:f.id})});assert.equal(ticket.status,200);const bytes=await (await t.request((await ticket.json()).url)).arrayBuffer();assert.deepEqual(Buffer.from(bytes),png);f.sha256=await sha256(bytes);}
 const manifest=validateBackup({...catalog,files}),hash=await sha256(new TextEncoder().encode(JSON.stringify(manifest)));
 const start={action:'start',header:{...catalog,folders:catalog.folders.length,photos:catalog.photos.length,sources:catalog.sources.length,drawings:catalog.drawings.length,manifestHash:hash}};
 assert.equal((await post(start)).status,200);const job=catalog.backupId;
 assert.equal((await t.request('/api/restore?job='+job,{headers:{cookie:''}})).status,401);
 assert.equal((await post({action:'finish',job})).status,409);
 const records=Object.entries({folder:catalog.folders,photo:catalog.photos,source:catalog.sources,drawing:catalog.drawings,file:files}).flatMap(([kind,items])=>items.map((value,position)=>({kind,value,position})));
 assert.equal((await post({action:'records',job,records})).status,200);
 assert.equal((await post({action:'records',job,records})).status,200);
 assert.equal((await post({action:'finish',job})).status,409);
 assert.equal((await t.db.prepare('SELECT COUNT(*) n FROM survey_folders').first()).n,1,'incomplete restore is hidden');
 for(const f of files){const url='/api/restore?'+new URLSearchParams({job,kind:f.kind,id:f.id});assert.equal((await t.request(url,{method:'PUT',body:Buffer.concat([png,Buffer.from('corrupt')])})).status,422);assert.equal((await t.request(url,{method:'PUT',body:png})).status,201);assert.equal((await t.request(url,{method:'PUT',body:png})).status,200);}
 const finish=await post({action:'finish',job});assert.equal(finish.status,200,await finish.text());
 assert.equal((await post({action:'finish',job})).status,200);
 const folders=(await t.request('/api/library').then(r=>r.json())).folders;assert.equal(folders.length,2);
 const restored=folders.find(f=>f.id!=='fixture');assert.equal(restored.remarks,'보존할 비고');assert.equal(restored.surveyStatus,'완료');assert.equal(restored.drawingCount,1);assert.ok(restored.region.startsWith('복원 '));
 const restoredPhoto=await t.db.prepare('SELECT * FROM photos WHERE folder=?').bind(restored.id).first();assert.deepEqual(Buffer.from(await (await (await t.mf.getR2Bucket('BUCKET')).get(restoredPhoto.object_key)).arrayBuffer()),png);
 const restoredDraft=await t.db.prepare('SELECT * FROM drawing_drafts WHERE photo_id=?').bind(restoredPhoto.id).first();assert.deepEqual(JSON.parse(restoredDraft.draft),draft);assert.equal(restoredDraft.revision,3);
 assert.equal((await t.db.prepare('SELECT COUNT(*) n FROM schedule_imports').first()).n,2);
 assert.equal((await t.request('/api/restore?job='+job,{method:'DELETE'})).status,409);
 const cancelledId=crypto.randomUUID(),cancelStart={...start,header:{...start.header,backupId:cancelledId}};
 assert.equal((await post(cancelStart)).status,200);
 await t.db.prepare("UPDATE restore_jobs SET status='cancelling' WHERE id=?").bind(cancelledId).run();
 assert.equal((await post({action:'finish',job:cancelledId})).status,409);
 assert.equal((await t.request('/api/restore?job='+cancelledId,{method:'DELETE'})).status,200);
 assert.equal((await t.db.prepare('SELECT COUNT(*) n FROM survey_folders').first()).n,2);
 console.log('PASS: complete originals/metadata/drawing round trip, hash rejection, hidden staging, idempotent retry and owner guard');
}finally{await t.close();}
