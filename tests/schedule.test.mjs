import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule} from '../lib/schedule-input.ts';
import {parseScheduleText} from '../lib/schedule-ocr.ts';
const sample={region:' 사직4구역 ',date:'2026-09-18',folders:[{lot:'사직동158 - 22',time:'10:00',name:'연락 대상',phones:[],address:'주소',notes:'',group:1}],warnings:[]};
test('uses the survey date supplied by the document and normalizes property names',()=>{
 const parsed=validateSchedule(sample);assert.equal(parsed.region,'사직4구역');assert.equal(parsed.date,'2026-09-18');assert.equal(parsed.folders[0].lot,'사직동 158-22');
});
test('rejects missing or impossible dates instead of substituting upload date',()=>{
 for(const date of ['',null,'2026-02-30','2026-13-17'])assert.throws(()=>validateSchedule({...sample,date}));
});
test('rejects an empty schedule or unsafe folder components',()=>{
 assert.throws(()=>validateSchedule({...sample,folders:[]}));
 assert.throws(()=>validateSchedule({...sample,region:'../private'}));
});
test('extracts document region, date and line-wrapped lots without treating phones as lots',()=>{
 const result=parseScheduleText('사직4구역 현장조사\n현장일자 : 2026년 9월 21일\n사직동\n158-22\n010-1234-5678\n사직동 159-4');
 assert.equal(result.region,'사직4구역');assert.equal(result.date,'2026-09-21');assert.deepEqual(result.folders.map(f=>f.lot),['사직동 158-22','사직동 159-4']);
 assert.equal(parseScheduleText('일정표\n사직동 158-22').date,'');
});
test('restricts numeric lots to their table column',()=>{
 const w=(text,x,y)=>({text,bbox:{x0:x,y0:y,x1:x+60,y1:y+20}});
 const result=parseScheduleText('사직4구역\n2026.9.22',[w('번지',100,100),w('사직동',100,180),w('158-22',100,210),w('1267-39',600,210)]);
 assert.deepEqual(result.folders.map(f=>f.lot),['사직동 158-22']);
});
