import test from 'node:test';
import assert from 'node:assert/strict';
import {exportEntries} from '../lib/export-entries.ts';
import {createZipStream} from '../lib/zip.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const manifest=(count,size=1)=>({entries:Array.from({length:count},(_,i)=>({name:i+'.jpg',size,url:'/photo/'+i}))});

test('ZIP fetches three originals ahead while preserving file order',async()=>{
 const pending=[],started=[];
 const entries=exportEntries(manifest(5),async url=>{started.push(url);return new Promise(resolve=>pending.push(()=>resolve(new Response(Uint8Array.of(Number(url.at(-1)))))));});
 const first=entries[0].open();await tick();assert.equal(started.length,3);
 pending[2]();pending[1]();pending[0]();
 assert.deepEqual(new Uint8Array(await new Response(await first).arrayBuffer()),Uint8Array.of(0));
 for(let i=1;i<5;i++){const next=entries[i].open();await tick();for(const finish of pending)finish();assert.deepEqual(new Uint8Array(await new Response(await next).arrayBuffer()),Uint8Array.of(i));}
 assert.deepEqual(started,['/photo/0','/photo/1','/photo/2','/photo/3','/photo/4']);entries.dispose();
});

test('large originals obey the prefetch memory budget instead of always fetching three',async()=>{
 const started=[],controller=new AbortController();
 const entries=exportEntries(manifest(3,20*1024*1024),async(url,{signal})=>{started.push(url);return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},controller.signal);
 const first=entries[0].open();await tick();assert.equal(started.length,1);controller.abort();await assert.rejects(first,{name:'AbortError'});entries.dispose();
});

test('failed prefetch aborts siblings and never publishes a partial archive',async()=>{
 let cancelled=0,closed=false;
 const entries=exportEntries(manifest(5),async(url,{signal})=>url.endsWith('/1')?new Response('no',{status:503}):new Promise((_,reject)=>signal.addEventListener('abort',()=>{cancelled++;reject(signal.reason);},{once:true})));
 await assert.rejects(createZipStream(entries).pipeTo(new WritableStream({write(){},close(){closed=true;}})));
 assert.equal(closed,false);assert.ok(cancelled>=1);
});

test('destination failure cancels outstanding prefetched originals',async()=>{
 let cancelled=0,writes=0;
 const entries=exportEntries(manifest(4),async(url,{signal})=>url.endsWith('/0')?new Response(Uint8Array.of(0)):new Promise((_,reject)=>signal.addEventListener('abort',()=>{cancelled++;reject(signal.reason);},{once:true})));
 await assert.rejects(createZipStream(entries).pipeTo(new WritableStream({write(){if(++writes===2)throw Error('disk full');}})),/disk full/);
 assert.equal(cancelled,2);
});

test('legacy oversized originals stream without buffering the complete image',async()=>{
 let requests=0,pulls=0;
 const entries=exportEntries(manifest(2,40*1024*1024),async()=>{requests++;return new Response(new ReadableStream({pull(out){pulls++;out.enqueue(new Uint8Array(1024));}}));});
 const stream=await entries[0].open(),reader=stream.getReader();
 assert.equal((await reader.read()).value.length,1024);assert.equal(requests,1);assert.ok(pulls<10);
 await reader.cancel();entries.dispose();
});
