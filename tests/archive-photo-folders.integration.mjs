import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {testRuntime,png} from './test-runtime.mjs';
import {createZipStream} from '../lib/zip.ts';
import {exportEntries} from '../lib/export-entries.ts';
import {addressParts} from '../lib/address-folders.ts';

const t=await testRuntime();
const exportResponse=(params)=>t.request('/api/export?'+new URLSearchParams(params),{method:'POST'});
const manifest=async(params)=>{const response=await exportResponse(params);assert.equal(response.status,200,await response.clone().text());return response.json();};
const paths=(archive)=>archive.entries.map(e=>e.name);
const files=(archive)=>archive.entries.filter(e=>e.url!==null).map(e=>e.name);
function noEmptyDirectories(archive){for(const entry of archive.entries.filter(e=>e.url===null))assert.ok(files(archive).some(name=>name.startsWith(entry.name)),`Empty directory: ${entry.name}`);}
try{
  for(const id of ['a-empty','b-photo','c-drawing','d-deleted','e-other-date','f-other-region'])await t.folder(id);
  // Deliberately collide with the empty folder: filtering must not rename the photo folder.
  await t.db.prepare("UPDATE survey_folders SET survey_date='2026-09-24' WHERE id='e-other-date'").run();
  await t.db.prepare("UPDATE survey_folders SET lot=CASE WHEN id='b-photo' THEN '테스트동 100-01' ELSE '테스트동 100-1' END,address='테스트로 1' WHERE id IN ('a-empty','b-photo','e-other-date')").run();
  await t.db.prepare("UPDATE survey_folders SET region='다른 구역' WHERE id='f-other-region'").run();
  const bucket=await t.mf.getR2Bucket('BUCKET');
  for(const [id,folder,kind,deleted] of [['live','b-photo','photo',0],['plan','c-drawing','drawing',0],['gone','d-deleted','photo',1],['next-day','e-other-date','photo',0],['elsewhere','f-other-region','photo',0]]){
    await t.db.prepare('INSERT INTO photos(id,owner,folder,filename,object_key,content_type,size,created_at,kind,deleted) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,t.owner,folder,'original.png','key-'+id,'image/png',png.length,'2026-09-23T00:00:00.000Z',kind,deleted).run();
    await bucket.put('key-'+id,png,{httpMetadata:{contentType:'image/png'}});
  }
  const scope={region:'테스트',date:'2026-09-23'};
  const original=await manifest(scope),filtered=await manifest({...scope,photosOnly:'1'});
  assert.equal(original.entries.filter(e=>e.url===null).length,4);
  assert.equal(filtered.entries.filter(e=>e.url===null).length,1,'Only a folder containing a live field photo may remain');
  assert.deepEqual(files(filtered),files(original));assert.equal(filtered.files,1);assert.equal(filtered.totalBytes,png.length);noEmptyDirectories(filtered);
  assert.deepEqual(paths(await manifest({...scope,photosOnly:'0'})),paths(original));
  assert.deepEqual(paths(await manifest({...scope,photosOnly:'1'})),paths(filtered),'Repeat download keeps the same paths');
  const single=await manifest({folder:'b-photo',photosOnly:'1'});
  assert.deepEqual(files(single),files(filtered).map(name=>name.slice(name.indexOf('/')+1)));
  const all=await manifest({photosOnly:'1'});assert.equal(all.files,3);noEmptyDirectories(all);

  for(const folder of ['a-empty','c-drawing','d-deleted'])for(const extra of [{},{parts:'1'}]){
    const before=(await t.db.prepare('SELECT COUNT(*) n FROM r2_download_tickets').first()).n;
    const response=await exportResponse({folder,photosOnly:'1',...extra});assert.equal(response.status,400);assert.match((await response.json()).error,/다운로드할 현장 사진이 없습니다/);
    assert.equal((await t.db.prepare('SELECT COUNT(*) n FROM r2_download_tickets').first()).n,before,'Empty scopes issue no tickets');
  }
  // Address mode merges survey dates, including when the selected schedule itself is empty.
  const address=await manifest({folder:'a-empty',view:'address',photosOnly:'1'});
  assert.equal(address.files,2);assert.ok(paths(address).every(name=>!name.includes('2026-09-')));noEmptyDirectories(address);
  const categoryPath=addressParts({id:'a-empty',lot:'테스트동 100-1',address:'테스트로 1',unit:'',unitDisplay:'',region:'테스트'},true).map(part=>part.key);
  const nested=await manifest({region:'테스트',view:'address',path:JSON.stringify(categoryPath),photosOnly:'1'});
  assert.equal(nested.files,2);noEmptyDirectories(nested);

  // Read the actual tickets and independently inspect the resulting ZIP and original bytes.
  const zip=Buffer.from(await new Response(createZipStream(exportEntries(filtered,url=>t.request(url)))).arrayBuffer());
  const checked=spawnSync('python',['-c','import sys,io,zipfile,base64; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; photos=[n for n in z.namelist() if not n.endswith("/")]; dirs=[n for n in z.namelist() if n.endswith("/")]; assert len(photos)==len(dirs)==1; assert z.read(photos[0])==base64.b64decode(sys.argv[1]); assert photos[0].startswith(dirs[0])',png.toString('base64')],{input:zip,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);

  // A folder at a part boundary must not become an empty directory in the preceding ZIP.
  await t.db.prepare("UPDATE photos SET size=? WHERE kind='photo' AND deleted=0").bind(150*1024*1024).run();
  const plan=await manifest({region:'테스트',photosOnly:'1',parts:'1'});assert.deepEqual(plan.parts.map(p=>p.files),[1,1]);
  const partFiles=[];
  for(const part of plan.parts){const archive=await manifest({region:'테스트',photosOnly:'1',part:String(part.index),snapshot:plan.snapshot});noEmptyDirectories(archive);partFiles.push(...files(archive));}
  assert.equal(partFiles.length,2);assert.equal(new Set(partFiles).size,2);
  assert.equal((await exportResponse({region:'테스트',photosOnly:'0',part:'0',snapshot:plan.snapshot})).status,409);
  console.log('PASS: photo-bearing folders only, empty/drawing/deleted exclusions, stable paths, repeat/date/address scopes, ZIP originals and bounded parts');
}finally{await t.close();}
