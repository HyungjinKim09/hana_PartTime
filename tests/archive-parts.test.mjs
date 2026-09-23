import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archiveParts} from '../lib/archive-parts.ts';
test('parts preserve all names and originals exactly once within memory limit',()=>{const entries=[{name:'구역/날짜/주소/',size:0},...Array.from({length:31},(_,i)=>({name:`구역/날짜/주소/${i}.jpg`,size:7}))];const parts=archiveParts(entries,25);assert.equal(parts.length,11);assert.deepEqual(parts.flat(),entries);assert.ok(parts.every(p=>p.reduce((n,e)=>n+e.size,0)<=25));});
test('invalid file sizes cannot bypass memory limit',()=>{assert.throws(()=>archiveParts([{name:'x',size:-1}]));assert.throws(()=>archiveParts([{name:'x',size:21}],20));});
