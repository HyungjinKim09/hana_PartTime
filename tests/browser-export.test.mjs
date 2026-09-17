import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createZipStream} from '../lib/zip.ts';
import {exportEntries} from '../lib/export-entries.ts';
test('29 originals totaling 94MB form a valid client-side ZIP with matching hashes',async()=>{
  const photo=new Uint8Array(3_233_000);for(let i=0;i<photo.length;i++)photo[i]=i%251;
  const entries=Array.from({length:29},(_,i)=>({name:`2026-09-17/사직동 158-8/${i}.jpg`,size:photo.length,url:`/api/export/ticket-${i}`}));
  let requests=0,progress=0;
  const stream=createZipStream(exportEntries({entries},async()=>{requests++;return new Response(photo);},undefined,bytes=>progress=bytes));
  const archive=Buffer.from(await new Response(stream).arrayBuffer());
  const result=spawnSync('python',['-c','import sys,io,zipfile,hashlib,json;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;print(json.dumps([hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()]))'],{input:archive,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const hash=createHash('sha256').update(photo).digest('hex');
  assert.deepEqual(JSON.parse(result.stdout),Array(29).fill(hash));assert.equal(requests,29);assert.equal(progress,29*photo.length);
});
test('failed or truncated originals abort the destination instead of closing a corrupt ZIP',async()=>{
  for(const response of [new Response(JSON.stringify({error:'원본 요청 실패'}),{status:503}),new Response('short')]){
    let closed=false,aborted=false;
    const stream=createZipStream(exportEntries({entries:[{name:'photo.jpg',size:10,url:'/api/export/ticket'}]},async()=>response));
    await assert.rejects(stream.pipeTo(new WritableStream({write(){},close(){closed=true;},abort(){aborted=true;}})));
    assert.equal(closed,false);assert.equal(aborted,true);
  }
});
test('cancelled download does not fetch another original',async()=>{
  const controller=new AbortController();controller.abort();let fetched=false;
  const stream=createZipStream(exportEntries({entries:[{name:'photo.jpg',size:1,url:'/api/export/ticket'}]},async()=>{fetched=true;return new Response('a');},controller.signal));
  await assert.rejects(new Response(stream).arrayBuffer(),{name:'AbortError'});assert.equal(fetched,false);
});
