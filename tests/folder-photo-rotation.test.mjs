import assert from 'node:assert/strict';
import test from 'node:test';
import {listFolderRotationPhotos,loadRotationSource} from '../lib/photo-rotation.ts';
import {photoVersionTag} from '../lib/types.ts';

test('folder rotation follows every page in the current gallery scope',async t=>{
 const first=Array.from({length:100},(_,i)=>({id:String(i),version:'',kind:'photo'}));
 const last={id:'last',version:'new-version',kind:'photo'};
 const requests=t.mock.method(globalThis,'fetch',async url=>{
  const params=new URL(url,'https://hana.test').searchParams;
  assert.equal(params.get('folder'),'current-folder');
  assert.equal(params.get('view'),'address');
  assert.equal(params.get('photosOnly'),'1');
  assert.equal(params.get('kind'),'photo');
  if(!params.has('cursor'))return Response.json({photos:first,nextCursor:'second page'});
  assert.equal(params.get('cursor'),'second page');
  return Response.json({photos:[last],nextCursor:null});
 });
 assert.deepEqual(await listFolderRotationPhotos('current-folder','address'),[...first,last]);
 assert.equal(requests.mock.callCount(),2);
});

test('a photo changed since the folder review is skipped before reading its pixels',async t=>{
 let bytesRead=false;
 t.mock.method(globalThis,'fetch',async()=>({ok:true,headers:new Headers({etag:photoVersionTag('photo','new-version')}),blob:async()=>{bytesRead=true;return new Blob();}}));
 await assert.rejects(loadRotationSource('/api/photos/photo',undefined,photoVersionTag('photo','old-version')),{status:412});
 assert.equal(bytesRead,false);
});
