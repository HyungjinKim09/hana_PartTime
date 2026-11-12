import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

const t=await testRuntime();
try{
 const endpoint='/api/folders?photos=1';
 const upload=async(folder,kind='photo')=>{
  const response=await t.request('/api/library?'+new URLSearchParams({folder,kind,filename:'image.png'}),{method:'POST',body:png});
  assert.equal(response.status,201);
  return (await response.json()).photo.id;
 };
 const request=(method,body,headers={})=>t.request(endpoint,{method,headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 await Promise.all(['alpha','beta','keep'].map(id=>t.folder(id)));
 await t.db.prepare("UPDATE survey_folders SET remarks='keep this' WHERE id='alpha'").run();
 await t.db.prepare("INSERT INTO schedule_imports (id,owner,filename,object_key,content_type,size,draft,region,survey_date,created_at) VALUES ('source',?,'schedule.png','source-key','image/png',1,'{}','테스트','2026-09-23','2026-09-23T00:00:00.000Z')").bind(t.owner).run();
 const drawing=await upload('alpha','drawing'),outside=await upload('keep');
 for(let i=0;i<11;i++)await upload(i%2?'beta':'alpha');
 const selection={ids:['alpha','beta','alpha']};
 const first=await request('POST',selection);
 assert.equal(first.status,200);
 const preview=await first.json();
 assert.ok(preview.batchId,'preview creates a photo-only deletion receipt');
 assert.deepEqual([preview.folders,preview.photos,preview.drawings,preview.sources],[2,11,0,0]);
 assert.equal((await request('DELETE',{batchId:preview.batchId},{origin:'https://elsewhere.test'})).status,403);
 await upload('beta');
 assert.equal((await request('DELETE',{batchId:preview.batchId})).status,409,'a changed folder must be reviewed again');
 const updated=await (await request('POST',selection)).json();
 assert.equal(updated.photos,12);
 const confirm=()=>request('DELETE',{batchId:updated.batchId});
 const initial=await confirm();
 assert.equal(initial.status,200,await initial.clone().text());
 assert.deepEqual(await initial.json(),{deleted:false,remaining:2});
 const newPhoto=await upload('alpha');
 const finished=await confirm();
 assert.equal(finished.status,200);
 assert.deepEqual(await finished.json(),{deleted:true,remaining:0});
 assert.deepEqual(await (await confirm()).json(),{deleted:true,remaining:0});
 const folders=await t.db.prepare('SELECT id,remarks,deleting FROM survey_folders ORDER BY id').all();
 assert.deepEqual(folders.results.map(f=>[f.id,f.remarks,f.deleting]),[['alpha','keep this',0],['beta','',0],['keep','',0]]);
 const photos=await t.db.prepare('SELECT id FROM photos').all();
 assert.deepEqual(new Set(photos.results.map(p=>p.id)),new Set([drawing,outside,newPhoto]));
 assert.ok(await t.db.prepare("SELECT id FROM schedule_imports WHERE id='source' AND deleted=0").first());
 assert.equal((await t.db.prepare('SELECT COUNT(*) AS n FROM r2_object_usage').first()).n,3);
 console.log('PASS: selected folders keep their records and documents, stale previews fail, batched cleanup is retryable, and later uploads survive');
}finally{await t.close();}
