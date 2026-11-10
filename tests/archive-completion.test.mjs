import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mergeReceiptCoverage,archiveCompletionReceipt} from '../lib/archive-completion.ts';
test('split coverage requires all photos and duplicate downloads cannot fill gaps',()=>{
 const first={folder:'house',revision:2,total:60000,ranges:[[0,20000]]},last={...first,ranges:[[40000,60000]]};
 assert.deepEqual(mergeReceiptCoverage([first,first,last])[0].ranges,[[0,20000],[40000,60000]]);
 assert.deepEqual(mergeReceiptCoverage([first,last,{...first,ranges:[[20000,40000]]}])[0].ranges,[[0,60000]]);
 assert.throws(()=>mergeReceiptCoverage([first,{...last,revision:3}]),/변경/);
});
test('large receipt snapshots stay bounded without serializing every image identity',async()=>{
 const photos=Array.from({length:60000},(_,i)=>({id:'original-'+i,folder:'large',object_key:'object-'+i})),bindings=[];
 const db={prepare:()=>({bind:(...values)=>{bindings.push(values);return {};} }),batch:async()=>[]};
 const ids=await archiveCompletionReceipt(db,'owner',[{id:'large',photoRevision:8}],photos,photos.map(p=>p.object_key));assert.equal(ids.length,1);
 const value=JSON.parse(bindings.at(-1)[2]);assert.deepEqual(value,[{folder:'large',revision:8,total:60000,ranges:[[0,60000]]}]);assert.ok(Buffer.byteLength(bindings.at(-1)[2])<1000);
});
