import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapeFrameLayout,drawLandscapeFrame,parseCameraTurns} from '../lib/camera-frame.ts';

test('default is landscape; every click adds exactly 90 degrees and four clicks restore it',()=>{
 for(const [w,h,base] of [[640,480,0],[480,640,90]])for(let turns=0;turns<=4;turns++){
  const rotation=(base+turns*90)%360;const swap=rotation%180!==0;
  assert.deepEqual(landscapeFrameLayout(w,h,turns),{width:swap?h:w,height:swap?w:h,rotation});
 }
 assert.throws(()=>landscapeFrameLayout(0,1920,0));
});

test('saved rotation restores only valid quarter turns',()=>{
 for(let i=0;i<4;i++)assert.equal(parseCameraTurns(String(i)),i);
 for(const value of [null,'','garbage','90','-1','4','1.5'])assert.equal(parseCameraTurns(value),0);
});

test('all rotations preserve every corner in both preview and full-resolution JPEG rendering',()=>{
 const corners=[[[0,0],[1,0],[1,1],[0,1]],[[1,0],[1,1],[0,1],[0,0]],[[1,1],[0,1],[0,0],[1,0]],[[0,1],[0,0],[1,0],[1,1]]];
 for(const [w,h] of [[640,480],[480,640]])for(let turns=0;turns<4;turns++){
  const render=limit=>{let matrix;const context={setTransform(...m){matrix=m;},drawImage(){}};const canvas={width:0,height:0,getContext(){return context;}};
   drawLandscapeFrame(canvas,{},w,h,turns,limit);
   const [a,b,c,d,e,f]=matrix;
   return {width:canvas.width,height:canvas.height,corners:[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>[(a*x+c*y+e)/canvas.width,(b*x+d*y+f)/canvas.height])};
  };
  const full=render(),preview=render(160);assert.equal(full.width*full.height,w*h);assert.equal(Math.max(preview.width,preview.height),160);assert.deepEqual(preview.corners,full.corners);
  assert.deepEqual(full.corners,corners[((w<h?1:0)+turns)%4]);
 }
});
