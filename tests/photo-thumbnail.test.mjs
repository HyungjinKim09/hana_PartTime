import test from 'node:test';
import assert from 'node:assert/strict';
import {thumbnailFromImage,storePhotoThumbnail} from '../lib/photo-thumbnail.ts';
test('gallery previews preserve aspect ratio and lower JPEG quality until the response fits 64 KiB',async()=>{
 const previous=globalThis.document;const sizes=[];let encoded=0;
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(done,type){sizes.push([canvas.width,canvas.height]);done(new Blob([new Uint8Array(++encoded===1?70000:40000)],{type}));}};
 globalThis.document={createElement:()=>canvas};
 try{
  const preview=await thumbnailFromImage({},1200,800);
  assert.equal(preview.size,40000);assert.equal(preview.type,'image/jpeg');
  assert.deepEqual(sizes,[[480,320],[480,320]]);
  assert.deepEqual([canvas.width,canvas.height],[0,0]);
 }finally{if(previous)globalThis.document=previous;else delete globalThis.document;}
});
test('preview persistence uses the original version fence',async()=>{
 let submitted;
 const success=await storePhotoThumbnail({id:'photo/1',version:'revision-2'},new Blob(['preview']),async(url,options)=>{submitted={url,...options};return new Response(null,{status:200});});
 assert.equal(success,true);assert.equal(submitted.url,'/api/photos/photo%2F1');
 assert.equal(submitted.headers['If-Match'],'"photo-photo/1-revision-2"');
 assert.equal(await submitted.body.text(),'preview');
});
