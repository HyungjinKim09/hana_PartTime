import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

function jpeg(width,height){
 return Buffer.from([
  0xff,0xd8,
  0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,
  0xff,0xc0,0x00,0x11,8,height>>8,height&255,width>>8,width&255,3,
  1,0x11,0,2,0x11,0,3,0x11,0,
  0xff,0xd9,
 ]);
}

const t=await testRuntime();
try{
 await t.folder();
 const upload=async filename=>{
  const response=await t.request('/api/library?folder=fixture&filename='+filename,{method:'POST',body:png});
  assert.equal(response.status,201);
  return (await response.json()).photo;
 };
 const save=(photo,body,tag=photo.etag,headers={})=>t.request('/api/photos/'+photo.id,{
  method:'PUT',headers:{...(tag?{'if-match':tag}:{}),'content-type':'image/jpeg',...headers},body,
 });
 const source=await upload('source.png'),url='/api/photos/'+source.id;
 const original=await t.request(url),originalTag=original.headers.get('etag');
 source.etag=originalTag;
 assert.deepEqual(Buffer.from(await original.arrayBuffer()),png);
 const fallback=await t.request(url+'?preview=1');
 assert.equal(fallback.headers.get('x-hana-preview'),'original');
 assert.equal(fallback.headers.get('etag'),originalTag);
 assert.deepEqual(Buffer.from(await fallback.arrayBuffer()),png);

 const small=jpeg(480,320);
 assert.equal((await t.mf.dispatchFetch(t.origin+url,{method:'PUT',headers:{origin:t.origin,'if-match':originalTag,'content-type':'image/jpeg'},body:small})).status,401);
 assert.equal((await save(source,small,originalTag,{origin:'https://elsewhere.test'})).status,403);
 assert.equal((await save(source,small,null)).status,428);
 assert.equal((await save(source,small,'"stale"')).status,412);
 assert.equal((await save(source,Buffer.from('not an image'))).status,415);
 assert.equal((await save(source,Buffer.concat([small,Buffer.alloc(65*1024)]) )).status,413);
 assert.equal((await save(source,jpeg(641,320))).status,413);

 const foreign=crypto.randomUUID();
 await t.db.prepare(`INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index)
  VALUES('foreign-owner','foreign-folder','foreign','2026-11-19','foreign 1-1','','','','[]','','',1,0)`).run();
 await t.db.prepare(`INSERT INTO photos(id,owner,folder,filename,object_key,content_type,size,created_at,kind)
  VALUES(?,'foreign-owner','foreign-folder','foreign.jpg','foreign-key','image/jpeg',1,'2026-11-19T00:00:00Z','photo')`).bind(foreign).run();
 assert.equal((await t.request('/api/photos/'+foreign,{method:'PUT',headers:{'if-match':'"photo-'+foreign+'"','content-type':'image/jpeg'},body:small})).status,404);

 const revisionBefore=(await t.db.prepare("SELECT photo_revision FROM survey_folders WHERE id='fixture'").first()).photo_revision;
 const saved=await save(source,small,originalTag);
 assert.equal(saved.status,200,await saved.clone().text());
 const stored=(await t.db.prepare('SELECT thumbnail_key,version,size,object_key FROM photos WHERE owner=? AND id=?').bind(t.owner,source.id).first());
 assert.ok(stored.thumbnail_key);
 // Maintenance may already have selected an old attempt when publication wins.
 await t.db.prepare('INSERT INTO upload_attempts(object_key,owner,upload_id,started_at) VALUES(?,?,?,?)').bind(stored.thumbnail_key,t.owner,crypto.randomUUID(),Date.now()-700000).run();
 assert.equal((await t.request('/api/maintenance',{method:'POST'})).status,200);
 assert.ok(await (await t.mf.getR2Bucket('BUCKET')).head(stored.thumbnail_key),'maintenance must retain a published preview');
 assert.equal(stored.size,png.length);
 assert.equal(stored.version,source.version||'');
 assert.deepEqual(Buffer.from(await (await t.mf.getR2Bucket('BUCKET')).get(stored.object_key).then(o=>o.arrayBuffer())),png);
 const preview=await t.request(url+'?preview=1');
 assert.equal(preview.headers.get('x-hana-preview'),'thumbnail');
 assert.equal(preview.headers.get('content-type'),'image/jpeg');
 assert.notEqual(preview.headers.get('etag'),originalTag);
 assert.deepEqual(Buffer.from(await preview.arrayBuffer()),small);
 const forcedOriginal=await t.request(url+'?preview=1&download=1',{headers:{'if-none-match':originalTag}});
 assert.equal(forcedOriginal.status,200);
 assert.equal(forcedOriginal.headers.get('x-hana-preview'),'original');
 assert.equal(forcedOriginal.headers.get('content-disposition').startsWith('attachment'),true);
 assert.deepEqual(Buffer.from(await forcedOriginal.arrayBuffer()),png);
 const listing=await t.request('/api/library?folder=fixture&photosOnly=1');
 assert.equal((await listing.json()).photos.find(p=>p.id===source.id).thumbnail,true);
 assert.equal((await t.db.prepare("SELECT photo_revision FROM survey_folders WHERE id='fixture'").first()).photo_revision,revisionBefore);

 const repeated=await save(source,jpeg(2,2),originalTag);
 assert.equal(repeated.status,200);
 assert.equal((await t.db.prepare('SELECT thumbnail_key FROM photos WHERE id=?').bind(source.id).first()).thumbnail_key,stored.thumbnail_key);
 assert.deepEqual(Buffer.from(await (await t.mf.getR2Bucket('BUCKET')).get(stored.thumbnail_key).then(o=>o.arrayBuffer())),small);

 const rotated=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAABeK7cBAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 const patch=await t.request(url,{method:'PATCH',headers:{'if-match':originalTag},body:rotated});
 assert.equal(patch.status,200,await patch.clone().text());
 assert.equal(await (await t.mf.getR2Bucket('BUCKET')).head(stored.thumbnail_key),null);
 const afterRotation=await t.request(url+'?preview=1');
 assert.equal(afterRotation.headers.get('x-hana-preview'),'original');
 assert.deepEqual(Buffer.from(await afterRotation.arrayBuffer()),rotated);

 const doomed=await upload('delete.png'),doomedUrl='/api/photos/'+doomed.id;
 const doomedTag=(await t.request(doomedUrl)).headers.get('etag');
 assert.equal((await save(doomed,jpeg(24,20),doomedTag)).status,200);
 const doomedPhoto=await t.db.prepare('SELECT thumbnail_key,object_key FROM photos WHERE id=?').bind(doomed.id).first();
 assert.equal((await t.request('/api/library?id='+doomed.id,{method:'DELETE'})).status,200);
 const bucket=await t.mf.getR2Bucket('BUCKET');
 assert.equal(await bucket.head(doomedPhoto.thumbnail_key),null);
 assert.equal(await bucket.head(doomedPhoto.object_key),null);

 const failed=await upload('failure.png'),failedUrl='/api/photos/'+failed.id;
 const failedTag=(await t.request(failedUrl)).headers.get('etag');
 await t.db.prepare("CREATE TRIGGER fail_preview BEFORE UPDATE OF thumbnail_key ON photos BEGIN SELECT RAISE(ABORT,'synthetic preview metadata failure'); END").run();
 assert.equal((await save(failed,jpeg(12,9),failedTag)).status,503);
 await t.db.prepare('DROP TRIGGER fail_preview').run();
 assert.equal((await t.db.prepare('SELECT thumbnail_key FROM photos WHERE id=?').bind(failed.id).first()).thumbnail_key,null);
 assert.equal((await t.db.prepare('SELECT COUNT(*) AS n FROM upload_attempts').first()).n,0);
 const orphanCandidates=await (await t.mf.getR2Bucket('BUCKET')).list({prefix:`thumbnails/${t.owner}/${failed.id}/`});
 assert.equal(orphanCandidates.objects.length,0);

 const race=await upload('race.png'),raceUrl='/api/photos/'+race.id,raceTag=(await t.request(raceUrl)).headers.get('etag');
 const results=await Promise.all([save(race,jpeg(80,60),raceTag),save(race,jpeg(64,48),raceTag)]);
 assert.ok(results.every(r=>r.status===200),results.map(r=>r.status).join(','));
 const winner=await t.db.prepare('SELECT thumbnail_key FROM photos WHERE id=?').bind(race.id).first();
 assert.ok(winner.thumbnail_key);
 const racedObjects=await (await t.mf.getR2Bucket('BUCKET')).list({prefix:`thumbnails/${t.owner}/${race.id}/`});
 assert.deepEqual(racedObjects.objects.map(o=>o.key),[winner.thumbnail_key]);
 assert.equal((await t.db.prepare("SELECT COUNT(*) AS n FROM upload_attempts WHERE owner=?").bind(t.owner).first()).n,0);
 console.log('PASS: authenticated bounded preview create-once, fallback and forced originals, isolated ETags, metadata/folder revision invariants, failure/race cleanup, rotation and delete cleanup');
}finally{await t.close();}
