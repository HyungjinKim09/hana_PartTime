import assert from 'node:assert/strict';
import {isUltraWideCamera, preferredCamera, quickRearLenses} from '../lib/camera-lenses.ts';
const device=(deviceId,label)=>({deviceId,label});
assert.equal(isUltraWideCamera('Back Ultra Wide Camera'),true);
assert.equal(isUltraWideCamera('후면 초광각 카메라'),true);
assert.equal(isUltraWideCamera('Back camera 0.6x'),true);
assert.equal(isUltraWideCamera('Back Wide Camera'),false);
assert.equal(isUltraWideCamera('Front Ultra Wide Camera'),false);
assert.equal(isUltraWideCamera('camera 2'),false);
const cameras=[device('main','Back Wide Camera'),device('ultra','Back Ultra Wide Camera'),device('front','Front Camera')];
assert.equal(preferredCamera(cameras,''),'ultra');
assert.equal(preferredCamera(cameras,'main'),'main');
assert.equal(preferredCamera(cameras,'missing'),'ultra');
assert.equal(preferredCamera([device('unknown','camera 2')],''),'');
assert.deepEqual(quickRearLenses([...cameras,device('macro','Back Macro Camera')]),[
 {deviceId:'ultra',label:'초광각'}, {deviceId:'main',label:'1×'},
]);
assert.deepEqual(quickRearLenses([device('ultra','Back camera 0,6x'),device('main','후면 카메라')]),[
 {deviceId:'ultra',label:'0.6×'}, {deviceId:'main',label:'1×'},
]);
assert.deepEqual(quickRearLenses([device('tele','Back Telephoto Camera'),device('unknown','camera 2'),device('front','Front Wide Camera')]),[]);
console.log('PASS: ultrawide detection, no generic-wide/front guess, remembered selection, stale device fallback');
