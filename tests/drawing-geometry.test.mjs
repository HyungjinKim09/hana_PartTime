import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orthogonalize} from '../lib/drawing-geometry.ts';
const line=(id,a,b,dashed=false)=>({id,a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]},dashed});
test('straightens tilted corners and T junctions without disconnecting them',()=>{
 const input=[line('top',[100,100],[800,115]),line('right',[800,115],[810,800]),line('bottom',[810,800],[110,790]),line('left',[110,790],[100,100]),line('T',[450,107.5],[455,795],true)];
 const out=orthogonalize(input,960,720);
 for(const l of out)assert.ok(l.a.x===l.b.x||l.a.y===l.b.y);
 for(let i=0;i<4;i++)assert.deepEqual(out[i].b,out[(i+1)%4].a);
 assert.equal(out[4].a.y,out[0].a.y);assert.equal(out[4].b.y,out[2].a.y);
 assert.equal(out[4].dashed,true);assert.deepEqual(orthogonalize(out,960,720),out);
 assert.equal(input[0].b.y,115);
});
test('preserves clear diagonal strokes and respects non-square image angles',()=>{
 const diagonal=line('d',[200,200],[500,500]);assert.deepEqual(orthogonalize([diagonal],960,720),[diagonal]);
 const steep=line('s',[100,100],[200,160]);assert.deepEqual(orthogonalize([steep],300,900),[steep]);
 const joined=[diagonal,line('h',[500,500],[900,510])];const out=orthogonalize(joined,960,720);assert.deepEqual(out[0],diagonal);assert.deepEqual(out[1].a,diagonal.b);assert.equal(out[1].b.y,500);
});
test('trims short overshoots at corners and T junctions but preserves real extensions',()=>{
 const input=[line('wall',[100,100],[800,100]),line('corner',[100,90],[100,800]),line('T',[450,91],[450,600],true),line('long',[700,50],[700,600])];
 const out=orthogonalize(input);
 assert.equal(out[1].a.y,100);assert.equal(out[2].a.y,100);assert.equal(out[3].a.y,50);
 assert.equal(out[2].dashed,true);assert.deepEqual(orthogonalize(out),out);assert.equal(input[1].a.y,90);
});
test('preserves an intentional short connected step and a diagonal endpoint',()=>{
 const input=[line('wall',[100,100],[800,100]),line('v',[400,90],[400,600]),line('step',[400,90],[410,90]),line('diagonal',[700,90],[850,250]),line('attached',[700,90],[700,600])];
 assert.deepEqual(orthogonalize(input),input);
});
