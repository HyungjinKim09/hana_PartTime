import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBackup,inspectBackup,restoreBackup} from '../lib/backup-client.ts';
class Directory{
 constructor(name='disk'){this.name=name;this.files=new Map();this.dirs=new Map();}
 async getDirectoryHandle(name,{create=false}={}){if(!this.dirs.has(name)){if(!create)throw Error('missing directory');this.dirs.set(name,new Directory(name));}return this.dirs.get(name);}
 async getFileHandle(name,{create=false}={}){if(!create&&!this.files.has(name))throw Error('missing file');return {getFile:async()=>{if(!this.files.has(name))throw Error('missing file');return new File([this.files.get(name)],name);},createWritable:async()=>{let pending;return {write:async data=>{pending=data;},close:async()=>this.files.set(name,pending),abort:async()=>{}};}};}
}
const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
const catalog=()=>({format:'hana-backup',version:1,backupId:crypto.randomUUID(),createdAt:'2026-09-23T00:00:00.000Z',folders:[{id:'f',region:'가상 구역',date:'2026-09-23',lot:'테스트동 1',time:'오전중',name:'가상 대상',phones:[],address:'',notes:'비고',group:1}],photos:['a','b'].map(id=>({id,folder:'f',kind:'photo',filename:id+'.png',content_type:'image/png',size:bytes.length,created_at:'2026-09-23T00:00:00.000Z'})),sources:[],drawings:[]});
test('interrupted directory backup resumes verified files and commits completion only after all originals',async t=>{
 const disk=new Directory(),data=catalog(),controller=new AbortController();let originalRequests=0;
 t.mock.method(globalThis,'fetch',async(path,options={})=>{if(path==='/api/backup')return Response.json(options.method==='POST'?{url:'/original'}:data);if(path==='/original'){originalRequests++;if(originalRequests===1)controller.abort();return new Response(bytes);}throw Error('unexpected '+path);});
 await assert.rejects(makeBackup(disk,false,controller.signal,()=>{}),{name:'AbortError'});
 const root=[...disk.dirs.values()][0];assert.equal(root.files.has('manifest.json'),false);
 const manifest=await makeBackup(root,true,new AbortController().signal,()=>{});assert.equal(originalRequests,2,'first verified file is reused');assert.equal(manifest.files.length,2);assert.equal(root.files.has('manifest.json'),true);
 assert.deepEqual(await inspectBackup(root,new AbortController().signal,()=>{}),manifest);
 root.dirs.get('originals').dirs.get('photo').files.set('a.png',new Blob(['damaged']));
 await assert.rejects(inspectBackup(root,new AbortController().signal,()=>{}),/손상/);
});
test('restore resumes saved objects and does not announce success after failed publication',async t=>{
 const disk=new Directory(),data=catalog();let phase='backup',puts=0,done=false;
 t.mock.method(globalThis,'fetch',async(path,options={})=>{
  if(phase==='backup'){if(path==='/api/backup')return Response.json(options.method==='POST'?{url:'/original'}:data);return new Response(bytes);}
  if(options.method==='PUT'){puts++;return Response.json({saved:true});}
  if(options.method==='POST'){const body=JSON.parse(options.body);if(body.action==='finish')return Response.json({error:'cancelled'},{status:409});return Response.json({status:'open'});}
  return Response.json({status:'open',saved:[{kind:'photo',id:'a'}]});
 });
 const manifest=await makeBackup(disk,false,new AbortController().signal,()=>{}),root=[...disk.dirs.values()][0];phase='restore';
 await assert.rejects(restoreBackup(root,manifest,new AbortController().signal,msg=>{if(msg.startsWith('복원 완료'))done=true;}),/cancelled/);
 assert.equal(puts,1);assert.equal(done,false);
});
