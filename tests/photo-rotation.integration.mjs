import assert from 'node:assert/strict';
import {testRuntime,png} from './test-runtime.mjs';

const rotated=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAABeK7cBAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const t=await testRuntime();
try{
 await t.folder();
 const upload=async filename=>{
  const response=await t.request('/api/library?folder=fixture&filename='+filename,{method:'POST',body:png});
  assert.equal(response.status,201);
  return (await response.json()).photo;
 };
 const photo=await upload('turned.png'),other=await upload('keep.png');
 const url='/api/photos/'+photo.id;
 const old=await t.request(url),etag=old.headers.get('etag');
 assert.deepEqual(Buffer.from(await old.arrayBuffer()),png);
 const patch=(body=rotated,tag=etag,headers={})=>t.request(url,{method:'PATCH',headers:{'if-match':tag,...headers},body});
 const revision=(await t.db.prepare("SELECT photo_revision FROM survey_folders WHERE id='fixture'").first()).photo_revision;
 const before=(await t.db.prepare('SELECT object_key FROM photos WHERE id=?').bind(photo.id).first()).object_key;
 assert.equal((await t.mf.dispatchFetch(t.origin+url,{method:'PATCH',headers:{origin:t.origin,'if-match':etag},body:rotated})).status,401);
 assert.equal((await patch(rotated,etag,{origin:'https://elsewhere.test'})).status,403);
 assert.equal((await patch(Buffer.from('invalid'))).status,415);
 const response=await patch();
 assert.equal(response.status,200,await response.clone().text());
 const updated=(await response.json()).photo;
 assert.deepEqual([updated.id,updated.folder,updated.filename,updated.created_at],[photo.id,photo.folder,photo.filename,photo.created_at]);
 assert.equal(updated.size,rotated.length);
 assert.ok(updated.version);
 const object=await t.request(url,{headers:{'if-none-match':etag}});
 assert.equal(object.status,200);
 assert.notEqual(object.headers.get('etag'),etag);
 assert.deepEqual(Buffer.from(await object.arrayBuffer()),rotated);
 assert.equal((await t.request(url,{headers:{'if-none-match':object.headers.get('etag')}})).status,304);
 assert.equal((await patch()).status,412);
 assert.deepEqual(Buffer.from(await (await t.request(url+'?download=1')).arrayBuffer()),rotated);
 const folder=await t.db.prepare("SELECT photo_revision FROM survey_folders WHERE id='fixture'").first();
 assert.equal(folder.photo_revision,revision+1);
 const archive=await (await t.request('/api/export?folder=fixture',{method:'POST'})).json();
 const entry=archive.entries.find(item=>item.name.endsWith('turned.png'));
 assert.deepEqual(Buffer.from(await (await t.request(entry.url)).arrayBuffer()),rotated);
 const oldBackup=await t.request('/api/backup',{method:'POST',body:JSON.stringify({kind:'photo',id:photo.id,version:''})});
 assert.equal(oldBackup.status,409);
 assert.equal(await (await t.mf.getR2Bucket('BUCKET')).head(before),null);

 await t.db.prepare("CREATE TRIGGER fail_rotation BEFORE UPDATE OF object_key ON photos BEGIN SELECT RAISE(ABORT,'synthetic rotation metadata failure'); END").run();
 assert.equal((await patch(png,object.headers.get('etag'))).status,503);
 assert.deepEqual(Buffer.from(await (await t.request(url)).arrayBuffer()),rotated);
 assert.equal((await t.db.prepare('SELECT COUNT(*) AS n FROM r2_object_usage').first()).n,2);
 await t.db.prepare('DROP TRIGGER fail_rotation').run();

 const deleted=await t.request('/api/library?id='+photo.id,{method:'DELETE'});
 assert.equal(deleted.status,200);
 assert.equal((await t.request(url)).status,404);
 assert.equal((await t.request('/api/photos/'+other.id)).status,200);
 assert.ok(await t.db.prepare("SELECT 1 FROM survey_folders WHERE id='fixture' AND deleting=0").first());
 const {photos}=await (await t.request('/api/library?folder=fixture&photosOnly=1')).json();
 assert.deepEqual(photos.map(item=>item.id),[other.id]);
 console.log('PASS: rotation saves replacement bytes in place, fences stale edits, updates download and ZIP, preserves data on failure, and deletes only the chosen photo');
}finally{await t.close();}
