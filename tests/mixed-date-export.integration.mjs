import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {exportEntries} from '../lib/export-entries.ts';
import {createZipStream} from '../lib/zip.ts';
import {testRuntime,png} from './test-runtime.mjs';

const date='2026-11-12',region='혼합 검증 구역';
const t=await testRuntime();
try{
 const fixtures=[
  {id:'general',lot:'명장동 321-23',unit:'',address:'반송로 327-6',date},
  {id:'apt-a',lot:'명장동 300-89',unit:'한신아파트 2동 506호',address:'',date},
  {id:'apt-b',lot:'명장동 300-89',unit:'한신아파트 3동 506호',address:'',date},
  {id:'apt-no-block',lot:'명장동 300-89',unit:'한신아파트 507호',address:'',date},
  {id:'villa',lot:'명장동 321-47',unit:'황금빌라 B동 502호',address:'',date},
  {id:'room-only',lot:'명장동 321-23',unit:'601호',address:'반송로 327-6',date},
  {id:'address-unit',lot:'명장동 497-76',unit:'',address:'명서로 148-3 (아림파크 1동 101호)',date},
  {id:'unit-day',lot:'명장동 300-89',unit:'한신아파트 2동 506호',address:'',date:'2026-11-13'},
 ];
 for(const f of fixtures){
  await t.folder(f.id);
  await t.db.prepare('UPDATE survey_folders SET region=?,survey_date=?,lot=?,unit=?,address=? WHERE id=?').bind(region,f.date,f.lot,f.unit,f.address,f.id).run();
  assert.equal((await t.request('/api/library?'+new URLSearchParams({folder:f.id,filename:f.id+'.png'}),{method:'POST',body:png})).status,201);
 }
 const download=async params=>{
  const response=await t.request('/api/export?'+new URLSearchParams(params),{method:'POST'});
  assert.equal(response.status,200,await response.clone().text());
  return response.json();
 };
 const mixed={region,date,view:'date'};
 const manifest=await download(mixed);
 const pathFor=(entries,id)=>entries.find(e=>e.url&&e.name.endsWith('_'+id+'.png'))?.name.split('/').slice(0,-1).join('/');
 assert.equal(pathFor(manifest.entries,'general'),date+'/명장동 321-023(반송로 327-6)');
 assert.equal(pathFor(manifest.entries,'apt-a'),date+'/명장동 300-089(한신아파트)/2동/506호');
 assert.equal(pathFor(manifest.entries,'apt-b'),date+'/명장동 300-089(한신아파트)/3동/506호');
 assert.equal(pathFor(manifest.entries,'apt-no-block'),date+'/명장동 300-089(한신아파트)/507호');
 assert.equal(pathFor(manifest.entries,'villa'),date+'/명장동 321-047(황금빌라)/B동/502호');
 assert.equal(pathFor(manifest.entries,'room-only'),date+'/명장동 321-023(반송로 327-6) (2)/601호');
 assert.equal(pathFor(manifest.entries,'address-unit'),date+'/명장동 497-076(아림파크)(명서로 148-3)/1동/101호');
 assert.equal(manifest.files,7);

 const partPlan=await download({...mixed,parts:'1',photosOnly:'1'});
 const part=await download({...mixed,part:'0',snapshot:partPlan.snapshot,photosOnly:'1'});
 assert.equal(pathFor(part.entries,'apt-a'),pathFor(manifest.entries,'apt-a'));
 assert.equal(pathFor((await download({folder:'apt-a',view:'date'})).entries,'apt-a'),pathFor(manifest.entries,'apt-a').slice(date.length+1));
 assert.equal(pathFor((await download({...mixed,date:'2026-11-13'})).entries,'unit-day'),'2026-11-13/506호');
 assert.equal(pathFor((await download({region,view:'address'})).entries,'villa'),'구분건물/명장동 321-047(황금빌라)/B동 502호');
 const zip=await new Response(createZipStream(exportEntries(manifest,t.request))).arrayBuffer();
 const extracted=spawnSync('python',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps(z.namelist()))'],{input:Buffer.from(zip),encoding:'utf8'});
 assert.equal(extracted.status,0,extracted.stderr);
 assert.deepEqual(JSON.parse(extracted.stdout),manifest.entries.map(entry=>entry.name));
 console.log('PASS: mixed-date ZIP nests buildings, optional blocks and rooms, with consistent partial downloads and stable general and address paths');
}finally{await t.close();}
