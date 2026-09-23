import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
const t=await testRuntime({beforeMigration:async(db,file)=>{
 if(file!=='0014_library_stats_settings.sql')return;
 await db.prepare("INSERT INTO survey_folders(owner,id,region,survey_date,lot,time,name,phones,address,notes,group_index,sort_index) VALUES('legacy-owner','legacy-folder','가상 이관 구역','2026-09-22','테스트동 1','','가상 대상','[]','','',1,0)").run();
 for(const [i,kind,deleted] of [[1,'photo',0],[2,'photo',0],[3,'drawing',0],[4,'photo',1]])await db.prepare('INSERT INTO photos(id,owner,folder,filename,object_key,content_type,size,created_at,kind,deleted) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('legacy-'+i,'legacy-owner','legacy-folder','synthetic.png','legacy-'+i,'image/png',i*100,'2026-09-22',kind,deleted).run();
}});
try{
 const stats=await t.db.prepare("SELECT * FROM folder_stats WHERE owner='legacy-owner'").first();assert.equal(stats.count,3);assert.equal(stats.bytes,600);assert.equal(stats.photo_count,2);assert.equal(stats.photo_bytes,300);assert.equal(stats.drawing_count,1);
 await t.folder();
 for(let i=0;i<7;i++){const r=await t.request('/api/library?folder=fixture&filename='+i+'.png',{method:'POST',body:png});assert.equal(r.status,201);}
 const info=await(await t.request('/api/library')).json();assert.equal(info.folders[0].count,7);assert.equal(info.folders[0].bytes,7*png.length);
 const ids=[];let cursor='';
 do{const r=await t.request('/api/library?folder=fixture&photosOnly=1&limit=3'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(r.status,200);const page=await r.json();assert.equal(page.folders,undefined);assert.ok(page.photos.length<=3);ids.push(...page.photos.map(p=>p.id));cursor=page.nextCursor||'';}while(cursor);
 assert.equal(ids.length,7);assert.equal(new Set(ids).size,7);
 assert.equal((await t.request('/api/library?folder=fixture&photosOnly=1&cursor=bad')).status,400);
 await t.request('/api/library?id='+ids[0],{method:'DELETE'});assert.equal((await(await t.request('/api/library')).json()).folders[0].count,6);
 const settings={storageGB:12,acknowledgeCost:true};
 assert.equal((await t.request('/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(settings)})).status,403);
 assert.equal((await t.request('/api/settings',{method:'PUT',headers:{'content-type':'application/json','x-admin-key':t.adminKey},body:JSON.stringify({...settings,acknowledgeCost:false})})).status,400);
 assert.equal((await t.request('/api/settings',{method:'PUT',headers:{'content-type':'application/json','x-admin-key':t.adminKey},body:JSON.stringify(settings)})).status,200);
 assert.equal((await(await t.request('/api/library')).json()).usage.storageLimit,12000000000);
 console.log('PASS: bounded cursor pages, complete identity set, aggregate deletion, protected cost-aware settings');
}finally{await t.close();}
