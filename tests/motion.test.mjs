import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollBehavior} from '../lib/motion.ts';
test('programmatic scrolling respects reduced motion and remains safe during SSR',()=>{
 const previous=globalThis.window;
 try{
  delete globalThis.window;assert.equal(scrollBehavior(),'instant');
  globalThis.window={matchMedia:()=>({matches:true})};assert.equal(scrollBehavior(),'instant');
  globalThis.window={matchMedia:()=>({matches:false})};assert.equal(scrollBehavior(),'smooth');
 }finally{if(previous)globalThis.window=previous;else delete globalThis.window;}
});
