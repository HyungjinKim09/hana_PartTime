import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectifyDrawing,validQuad,reviewLines,normalizePaper} from '../lib/drawing-processing.ts';
import {traceDrawing} from '../lib/drawing-trace.ts';
test('shadow normalization recovers a dark photograph without inventing lines on blank paper',()=>{
 const w=300,h=240,data=new Uint8ClampedArray(w*h*4).fill(255);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const wall=((y===40||y===200)&&x>=40&&x<=260)||((x===40||x===260)&&y>=40&&y<=200);const v=wall?25:36;const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=v;}
 assert.equal(traceDrawing(data,w,h).length,0);
 assert.ok(traceDrawing(normalizePaper(data,w,h),w,h).length>=4);
 const blank=new Uint8ClampedArray(w*h*4).fill(45);assert.equal(traceDrawing(normalizePaper(blank,w,h),w,h).length,0);
});
test('perspective correction preserves identity pixels and rejects crossed corners',()=>{
 const width=80,height=60,data=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<data.length;i++)data[i]=i%251;
 const quad=[{x:0,y:0},{x:1000,y:0},{x:1000,y:1000},{x:0,y:1000}];
 assert.deepEqual(rectifyDrawing(data,width,height,quad).data,data);
 assert.equal(validQuad([quad[0],quad[2],quad[1],quad[3]]),false);
 assert.throws(()=>rectifyDrawing(data,width,height,[quad[0],quad[0],quad[2],quad[3]]));
});
test('trapezoid corners map to the corrected rectangle corners',()=>{
 const width=101,height=101,data=new Uint8ClampedArray(width*height*4).fill(255);
 const quad=[{x:200,y:100},{x:800,y:100},{x:1000,y:900},{x:0,y:900}];
 for(const p of quad){const i=(p.y/10*width+p.x/10)*4;data[i]=12;}
 const out=rectifyDrawing(data,width,height,quad);
 for(const i of [0,out.width-1,(out.height-1)*out.width,out.width*out.height-1])assert.equal(out.data[i*4],12);
});
test('review marks dangling ends but not connected small room divisions',()=>{
 const line=(id,a,b)=>({id,a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]},dashed:true});
 const lines=[line('top',[100,100],[900,100]),line('left',[100,100],[100,900]),line('bottom',[100,900],[900,900]),line('right',[900,100],[900,900]),line('small',[200,100],[200,200]),line('base',[100,200],[200,200]),line('loose',[500,100],[500,500])];
 assert.deepEqual(reviewLines(lines),['loose']);
});
