import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';
const t=await testRuntime();
try{
 for(let i=0;i<125;i++)await t.db.prepare("INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,remarks,group_index,sort_index) VALUES(?,?,?,'2026-10-10',?,'','오전중','가상 대상','[\"010-0000-0000\"]','가상로 1','private visit note','private remark',1,?)").bind(t.owner,'scope-'+i,i<120?'A구역':'B구역','가상동 '+i,i).run();
 const root=await(await t.request('/api/library')).json();
 assert.equal(root.folders.length,0,'root must not ship every schedule');
 assert.equal(root.cards.length,2);assert.equal(root.summary.schedules,125);
 assert.ok(!JSON.stringify(root).includes('private visit note'));assert.ok(!JSON.stringify(root).includes('010-0000-0000'));
 const dates=await(await t.request('/api/library?region=A구역')).json();assert.equal(dates.cards.length,1);assert.equal(dates.summary.schedules,120);assert.deepEqual(dates.folders,[]);
 const page=await(await t.request('/api/library?region=A구역&date=2026-10-10&limit=50')).json();assert.equal(page.cards.length,50);assert.equal(page.folders.length,0);assert.ok(page.nextFoldersCursor);assert.ok(!JSON.stringify(page).includes('private visit note'));
 const next=await(await t.request('/api/library?region=A구역&date=2026-10-10&limit=50&foldersCursor='+page.nextFoldersCursor)).json();assert.equal(next.cards.length,50);assert.equal(new Set([...page.cards,...next.cards].map(c=>c.target.folder)).size,100);
 const detail=await(await t.request('/api/library?folder=scope-0')).json();assert.equal(detail.folders.length,1);assert.equal(detail.folders[0].notes,'private visit note');assert.equal(detail.folders[0].phones[0],'010-0000-0000');assert.equal(detail.usage,undefined,'detail reads must not recompute global budget');
 const usage=await(await t.request('/api/library?usageOnly=1')).json();assert.equal(usage.usage.storageLimit,8_000_000_000);assert.equal(usage.folders,undefined);
 const navigation=await(await t.request('/api/library?navigation=1&region=A구역')).json();assert.deepEqual(navigation.regions,['A구역','B구역']);assert.equal(navigation.dates[0].date,'2026-10-10');assert.equal(navigation.dates[0].schedules,120);
 const upload=await t.request('/api/library?folder=scope-0&filename=field.png',{method:'POST',body:png});assert.equal(upload.status,201);
 const leaf=await(await t.request('/api/library?folder=scope-0')).json();assert.equal(leaf.photos.length,1);assert.equal(leaf.summary.photos,1);
 const search=await(await t.request('/api/library?q=가상동%20119&view=date')).json();assert.equal(search.cards.length,1);assert.equal(search.cards[0].target.folder,'scope-119');assert.ok(!JSON.stringify(search).includes('private visit note'));
 const preview=await t.request('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selections:[{region:'B구역',view:'date'}]})});assert.equal(preview.status,200);const selection=await preview.json();assert.equal(selection.ids.length,5);assert.equal(selection.folders,5);assert.ok(!selection.ids.includes('scope-0'));
 assert.equal((await t.request('/api/library?foldersCursor=-1')).status,400);
 await t.db.prepare("INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index) VALUES(?,'same-address-peer','A구역','2026-10-11','가상동 0','','오후중','다른 방문','[\"010-1111-1111\"]','가상로 1','other visit private note',1,0)").bind(t.owner).run();
 const combined=await(await t.request('/api/library?folder=scope-0&view=address')).json();assert.equal(combined.folders.length,2);assert.equal(combined.folders.find(f=>f.id==='scope-0').notes,'private visit note');assert.equal(combined.folders.find(f=>f.id==='same-address-peer').notes,'','only the selected visit needs private details');assert.deepEqual(combined.folders.find(f=>f.id==='same-address-peer').phones,[]);
 const many=await t.request('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:Array.from({length:120},(_,i)=>'scope-'+i),selections:[{region:'B구역',view:'date'}]})});assert.equal(many.status,200,'selecting more than 100 paginated leaf folders must still work');assert.equal((await many.json()).folders,125);
 const categories=await(await t.request('/api/library?region=A구역&view=address')).json();const buildings=await(await t.request('/api/library?'+new URLSearchParams({region:'A구역',view:'address',path:JSON.stringify(categories.cards[0].target.path)}))).json();const path=buildings.cards.find(c=>c.summary.schedules===2).target.path;
 const legacy=await(await t.request('/api/library?'+new URLSearchParams({region:'A구역',view:'address',path:JSON.stringify(path.slice(1))}))).json();assert.equal(legacy.summary.schedules,2,'legacy bookmarked address paths must retain matching schedules');assert.deepEqual(legacy.canonicalAddressPath,path);
 console.log('PASS: scoped bounded library, private leaf details, separate usage/navigation, server search and lazy deletion selection');
}finally{await t.close();}
