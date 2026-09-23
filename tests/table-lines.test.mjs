import test from 'node:test';
import assert from 'node:assert/strict';
import {tableLines} from '../lib/table-ocr.ts';

// Synthetic ruled page with the address/notes header merged across two body columns.
// No names, addresses, or other information from user photographs is included.
function ruledPage(rows,cols=[20,48,110,176,285,342,446,620]){
  const width=640,height=900,pixels=new Uint8Array(width*height*4).fill(255);
  const ink=(x,y)=>{const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;};
  for(const y of rows)for(let dy=-1;dy<=1;dy++)for(let x=cols[0];x<=cols.at(-1);x++)ink(x,y+dy);
  for(let i=0;i<cols.length;i++)for(let dx=-1;dx<=1;dx++)for(let y=i===6?rows[1]:rows[0];y<=rows.at(-1);y++)ink(cols[i]+dx,y);
  return {width,height,pixels};
}

test('recognizes one schedule beneath a merged header despite large blank page margins',()=>{
  const lines=tableLines(ruledPage([150,205,286]));
  assert.ok(lines,'A header plus one data row is a valid schedule table');
  assert.deepEqual(lines.rows,[150,205,286]);
  assert.deepEqual(lines.cols,[20,48,110,176,285,342,446,620],'Address and visit notes stay in separate cells');
});

test('detects body-only dividers in short multi-row schedules with a tall merged header',()=>{
  const lines=tableLines(ruledPage([150,250,280,310]));
  assert.ok(lines);
  assert.deepEqual(lines.rows,[150,250,280,310]);
  assert.deepEqual(lines.cols,[20,48,110,176,285,342,446,620]);
});

test('keeps all boundaries in an ordinary multi-row schedule',()=>{
  const lines=tableLines(ruledPage([150,205,286,367,448]));
  assert.deepEqual(lines,{rows:[150,205,286,367,448],cols:[20,48,110,176,285,342,446,620]});
});

test('rejects a header without data, a blank page, and a grid without a narrow number column',()=>{
  assert.equal(tableLines(ruledPage([150,205])),null);
  assert.equal(tableLines({width:640,height:900,pixels:new Uint8Array(640*900*4).fill(255)}),null);
  assert.equal(tableLines(ruledPage([150,205,286],[20,120,220,320,420,520,620])),null);
});
