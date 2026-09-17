import {traceDrawing} from '../lib/drawing-trace.ts';
import {drawingSchema,drawingMetadataSchema,parseDrawingMetadata} from '../lib/drawing.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';
function raster(){const w=400,h=300,data=new Uint8Array(w*h*4).fill(255);function line(x0,y0,x1,y1,dashed=false){const length=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let n=0;n<=length;n++){if(dashed&&n%14>6)continue;const x=Math.round(x0+(x1-x0)*n/length),y=Math.round(y0+(y1-y0)*n/length);for(let d=-1;d<=1;d++){const i=((y+d)*w+x)*4;data[i]=data[i+1]=data[i+2]=35;}}}return {w,h,data,line};}
test('pixel tracing preserves an L-shaped notch and an observed internal division',()=>{const r=raster();for(const p of [[50,50,350,50],[350,50,350,250],[350,250,200,250],[200,250,200,200],[200,200,50,200],[50,200,50,50],[200,50,200,200]])r.line(...p);const lines=traceDrawing(r.data,r.w,r.h);assert.ok(lines.length>=6);const close=(p,x,y)=>Math.hypot(p.x-x/400*1000,p.y-y/300*1000)<15;assert.ok(lines.some(l=>Math.abs(l.a.x-500)<15&&Math.abs(l.b.x-500)<15&&Math.min(l.a.y,l.b.y)<675&&Math.max(l.a.y,l.b.y)>820));assert.ok(!lines.some(l=>l.a.x<140&&l.b.x<140&&Math.max(l.a.y,l.b.y)>700));});
test('blank paper cannot produce invented rooms',()=>{const r=raster();assert.deepEqual(traceDrawing(r.data,r.w,r.h),[]);assert.throws(()=>traceDrawing(r.data,20,30));});
test('metadata cannot supply wall geometry and source crop must be ordered',()=>{const m=parseDrawingMetadata({response:JSON.stringify({widthMeters:null,heightMeters:null,labels:[],warnings:[],lines:[{invented:true}]})});assert.equal('lines' in m,false);assert.equal(drawingMetadataSchema.safeParse({...m,labels:[{text:'방',x:1001,y:2,box:[1,2,3,4]}]}).success,false);assert.equal(drawingSchema.safeParse({version:1,widthMeters:1,heightMeters:1,lines:[{id:'a',a:{x:1,y:1},b:{x:5,y:1},dashed:false}],labels:[],warnings:[],source:{method:'pixel-trace',width:100,height:100,crop:{left:90,right:10,top:0,bottom:100}}}).success,false);});

test('inaccurate OCR boxes cannot cut through a continuous outer wall',()=>{const r=raster();for(const p of [[50,50,350,50],[350,50,350,250],[350,250,50,250],[50,250,50,50]])r.line(...p);const lines=traceDrawing(r.data,r.w,r.h,[[100,400,170,550]]);assert.ok(lines.some(l=>Math.abs(l.a.x-125)<15&&Math.abs(l.b.x-125)<15&&Math.min(l.a.y,l.b.y)<185&&Math.max(l.a.y,l.b.y)>810));});

import {rotatePoint,rotateBox,rotateCrop} from '../lib/drawing-image.ts';
test('sideways photos and crop/text coordinates rotate in the same frame',()=>{assert.deepEqual(rotatePoint({x:200,y:700},270),{x:700,y:800});assert.deepEqual(rotateBox([100,200,300,600],90),[400,100,800,300]);const c={left:5,top:10,right:95,bottom:80};assert.deepEqual(rotateCrop(rotateCrop(c,90),270),c);for(const r of [0,90,180,270])assert.deepEqual(rotatePoint(rotatePoint({x:237,y:641},r),(360-r)%360),{x:237,y:641});});
test('faint dashed boundaries survive without accepting paper grid as walls',()=>{const r=raster();for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){const value=x%8===0||y%8===0?239:250;const i=(y*r.w+x)*4;r.data[i]=r.data[i+1]=r.data[i+2]=value;}for(const p of [[50,50,350,50],[350,50,350,250],[350,250,50,250],[50,250,50,50]])r.line(...p);r.line(200,50,200,250,true);const lines=traceDrawing(r.data,r.w,r.h);assert.ok(lines.some(l=>Math.abs(l.a.x-500)<15&&Math.abs(l.b.x-500)<15&&l.dashed));assert.ok(lines.length<12);});
test('a small dashed enclosure next to handwriting keeps both short sides',()=>{
 const r=raster();for(const p of [[50,50,350,50],[350,50,350,250],[350,250,50,250],[50,250,50,50],[200,50,200,250],[200,120,300,120]])r.line(...p);
 r.line(225,120,225,165,true);r.line(200,165,225,165,true);
 const lines=traceDrawing(r.data,r.w,r.h,[[502,410,550,540]]);
 assert.ok(lines.some(l=>Math.abs(l.a.x-562.5)<12&&Math.abs(l.b.x-562.5)<12&&Math.min(l.a.y,l.b.y)<415&&Math.max(l.a.y,l.b.y)>535),'short side beside text');
 assert.ok(lines.some(l=>Math.abs(l.a.y-550)<12&&Math.abs(l.b.y-550)<12&&Math.min(l.a.x,l.b.x)<515&&Math.max(l.a.x,l.b.x)>545),'short enclosure bottom');
});
test('two short connected sides survive together instead of deleting each other',()=>{
 const r=raster();for(const p of [[50,50,350,50],[350,50,350,250],[350,250,50,250],[50,250,50,50],[200,50,200,250],[200,120,300,120]])r.line(...p);
 r.line(225,120,225,150,true);r.line(200,150,225,150,true);
 const lines=traceDrawing(r.data,r.w,r.h,[[505,415,540,475]]);
 assert.ok(lines.some(l=>Math.abs(l.a.x-562.5)<12&&Math.abs(l.b.x-562.5)<12&&Math.max(l.a.y,l.b.y)>490));
 assert.ok(lines.some(l=>Math.abs(l.a.y-500)<12&&Math.abs(l.b.y-500)<12&&Math.max(l.a.x,l.b.x)>545));
});
test('a letter-shaped box and dimension tail do not become extra rooms',()=>{
 const r=raster();for(const p of [[50,50,350,50],[350,50,350,250],[350,250,50,250],[50,250,50,50]])r.line(...p);
 r.line(180,250,180,275);r.line(150,50,150,80);r.line(150,80,175,80);r.line(175,50,175,80);
 const lines=traceDrawing(r.data,r.w,r.h,[[430,835,465,925],[355,160,445,280]]);
 assert.ok(!lines.some(l=>Math.max(l.a.y,l.b.y)>860),'dimension strokes stay excluded');
 assert.ok(!lines.some(l=>l.a.x>350&&l.a.x<450&&l.b.x>350&&l.b.x<450&&Math.max(l.a.y,l.b.y)>210),'text-shaped enclosure stays excluded');
});
