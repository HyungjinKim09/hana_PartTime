import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapeFrameLayout,drawLandscapeFrame} from '../lib/camera-frame.ts';

test('portrait camera frames become landscape, already-landscape frames stay upright',()=>{
 assert.deepEqual(landscapeFrameLayout(1920,2560,false),{width:2560,height:1920,rotation:90});
 assert.deepEqual(landscapeFrameLayout(2560,1920,false),{width:2560,height:1920,rotation:0});
 assert.deepEqual(landscapeFrameLayout(1920,2560,true),{width:2560,height:1920,rotation:270});
 assert.deepEqual(landscapeFrameLayout(2560,1920,true),{width:2560,height:1920,rotation:180});
 assert.throws(()=>landscapeFrameLayout(0,1920,false));
});

test('preview and full-resolution capture have identical normalized corner mapping without crop or mirror',()=>{
 for(const [w,h] of [[640,480],[480,640]])for(const flipped of [false,true]){
  const render=(limit)=>{let matrix;const context={setTransform(...m){matrix=m;},drawImage(){}};const canvas={width:0,height:0,getContext(){return context;}};
   drawLandscapeFrame(canvas,{},w,h,flipped,limit);
   const [a,b,c,d,e,f]=matrix;
   return {width:canvas.width,height:canvas.height,corners:[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>[(a*x+c*y+e)/canvas.width,(b*x+d*y+f)/canvas.height])};
  };
  const full=render(),preview=render(160);assert.equal(full.width,640);assert.equal(full.height,480);assert.equal(preview.width,160);assert.deepEqual(preview.corners,full.corners);
  const expected=w<h?(flipped?[[0,1],[0,0],[1,0],[1,1]]:[[1,0],[1,1],[0,1],[0,0]]):(flipped?[[1,1],[0,1],[0,0],[1,0]]:[[0,0],[1,0],[1,1],[0,1]]);
  assert.deepEqual(full.corners,expected);
 }
});
