import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';
const t=await testRuntime();
try{
 await t.folder();
 for(let i=0;i<22;i++)await t.db.prepare('INSERT INTO photos(id,owner,folder,filename,object_key,content_type,size,created_at,kind) VALUES(?,?,?,?,?,?,?,?,?)').bind('part-'+i,t.owner,'fixture','image.png','part-key-'+i,'image/png',10*1024*1024,'2026-09-23T00:00:00.000Z',i===21?'drawing':'photo').run();
 const preview=await t.request('/api/export?folder=fixture&parts=1',{method:'POST'});assert.equal(preview.status,200);const plan=await preview.json();assert.equal(plan.parts.length,2);assert.deepEqual(plan.parts.map(p=>p.files),[20,1]);
 assert.equal((await t.db.prepare('SELECT COUNT(*) n FROM r2_download_tickets').first()).n,0);
 const files=[];
 for(const part of plan.parts){const response=await t.request('/api/export?'+new URLSearchParams({folder:'fixture',part:String(part.index),snapshot:plan.snapshot}),{method:'POST'});assert.equal(response.status,200);const archive=await response.json();assert.ok(archive.totalBytes<=200*1024*1024);files.push(...archive.entries.filter(e=>e.url!==null).map(e=>e.name));}
 assert.equal(files.length,21);assert.equal(new Set(files).size,21);assert.ok(files.every(n=>!n.includes('part-21_')));
 await t.db.prepare("UPDATE photos SET filename='changed.png' WHERE id='part-0'").run();
 assert.equal((await t.request('/api/export?'+new URLSearchParams({folder:'fixture',part:'1',snapshot:plan.snapshot}),{method:'POST'})).status,409);
 console.log('PASS: bounded photo-only ZIP parts, exact complete set, no preview tickets, changed snapshot rejection');
}finally{await t.close();}
