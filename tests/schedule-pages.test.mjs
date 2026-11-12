import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSchedulePhotos,mergeSchedulePages,schedulePhotoBytes} from '../lib/schedule-pages.ts';

const page=(start,count,region='가상1구역',date='2026-11-07')=>({region,date,warnings:[],folders:Array.from({length:count},(_,i)=>({lot:`가상동 100-${start+i}`,sourceNumber:start+i}))});

test('same-day continuation sheets follow printed numbering and retain their source pages',()=>{
 const result=mergeSchedulePages([page(9,5),page(1,8)]);
 assert.deepEqual(result.folders.map(row=>row.sourceNumber),Array.from({length:13},(_,i)=>i+1));
 assert.deepEqual(result.folders.map(row=>row.sourcePage),[2,2,2,2,2,2,2,2,1,1,1,1,1]);
});

test('independent sheets with repeated numbering keep selection order and never merge rows by number',()=>{
 const first=page(1,3),second=page(1,2);
 second.folders[0].lot='가상동 200-1';
 const result=mergeSchedulePages([first,second]);
 assert.equal(result.folders.length,5);
 assert.equal(result.folders[3].lot,'가상동 200-1');
});

test('mismatched dates or regions are rejected and missing headers use the other sheet',()=>{
 assert.throws(()=>mergeSchedulePages([page(1,2),page(3,1,'가상2구역')]),/구역 또는 날짜/);
 assert.throws(()=>mergeSchedulePages([page(1,2),page(3,1,'가상1구역','2026-11-08')]),/구역 또는 날짜/);
 assert.equal(mergeSchedulePages([page(1,2,'',''),page(3,1)]).date,'2026-11-07');
});

test('multi-image imports respect the total byte and page caps',()=>{
 assert.doesNotThrow(()=>checkSchedulePhotos([{size:schedulePhotoBytes-1},{size:1}]));
 assert.throws(()=>checkSchedulePhotos([{size:schedulePhotoBytes},{size:1}]),/20MB/);
 assert.throws(()=>checkSchedulePhotos(Array(11).fill({size:1})),/1~10장/);
});
