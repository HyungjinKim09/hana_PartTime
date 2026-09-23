import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterFile} from '../lib/raster-file.ts';
test('rejects active documents, even with image names or MIME',async()=>{
 for(const text of ['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','<!doctype html><script>alert(1)</script>',''])for(const mime of ['image/png','image/svg+xml','text/html',''])await assert.rejects(()=>rasterFile(new File([text],'schedule.png',{type:mime})));
});
test('canonicalizes misleading MIME without changing raster bytes',async()=>{
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
 const f=await rasterFile(new File([bytes],'schedule.html',{type:'text/html'}));assert.equal(f.type,'image/png');assert.deepEqual(new Uint8Array(await f.arrayBuffer()),bytes);
});
