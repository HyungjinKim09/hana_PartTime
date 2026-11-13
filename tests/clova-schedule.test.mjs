import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClovaSchedule,clovaConfig,ocrMonth} from '../lib/clova-schedule.ts';
const cell=(rowIndex,columnIndex,text,extra={})=>({rowIndex,columnIndex,rowSpan:1,columnSpan:1,cellTextLines:text.split('\n').map(s=>({cellWords:[{inferText:s}]})),...extra});
const sample=(rows=1)=>({images:[{inferResult:'SUCCESS',fields:[{inferText:'명장2구역 현장조사'},{inferText:'2026년 9월 23일'}],tables:[{cells:[...['번호','번지','성명','연락처','시간','비고(새주소)'].map((s,i)=>cell(0,i,s,i===5?{columnSpan:2}:{})),...Array.from({length:rows},(_,i)=>[''+(i+1),'명장동\n300-65','김정미A','010-1234-5678',['오전중','오후중','아무때나'][i%3],'SKY빌라 B동 302호','방문 전 연락'].map((s,c)=>cell(i+1,c,s))).flat()]}]}]});
test('single row table preserves mixed scripts and source date',()=>{const d=parseClovaSchedule(sample());assert.equal(d.region,'명장2구역');assert.equal(d.date,'2026-09-23');assert.equal(d.folders.length,1);assert.equal(d.folders[0].name,'김정미A');assert.equal(d.folders[0].address,'SKY빌라 B동 302호');assert.equal(d.folders[0].time,'오전중');assert.equal(d.folders[0].lot,'명장동 300-65');});
test('preserves all rows, arbitrary time text and separate remarks',()=>{const d=parseClovaSchedule(sample(3));assert.deepEqual(d.folders.map(f=>f.time),['오전중','오후중','아무때나']);assert.equal(d.folders[1].notes,'방문 전 연락');});
test('failed and missing tables cannot silently produce incomplete schedules',()=>{assert.throws(()=>parseClovaSchedule({images:[{inferResult:'FAILURE'}]}));const s=sample();s.images[0].tables=[];assert.throws(()=>parseClovaSchedule(s));});
test('missing lot retained for review and merged body cells warned',()=>{const s=sample(2);s.images[0].tables[0].cells.find(c=>c.rowIndex===1&&c.columnIndex===1).cellTextLines=[];s.images[0].tables[0].cells.find(c=>c.rowIndex===1&&c.columnIndex===2).rowSpan=2;const d=parseClovaSchedule(s);assert.equal(d.folders.length,2);assert.equal(d.folders[0].lot,'');assert.ok(d.warnings.length>1);});
test('only fixed Naver HTTPS endpoint, secret and capped limit accepted',()=>{assert.equal(clovaConfig({}),null);assert.throws(()=>clovaConfig({CLOVA_OCR_URL:'https://evil.test',CLOVA_OCR_SECRET:'secret'}));assert.throws(()=>clovaConfig({CLOVA_OCR_URL:'https://ocr.apigw.ntruss.com/general',CLOVA_OCR_SECRET:'secret',CLOVA_OCR_MONTHLY_LIMIT:'101'}));assert.equal(clovaConfig({CLOVA_OCR_URL:'https://ocr.apigw.ntruss.com/general',CLOVA_OCR_SECRET:'secret'}).limit,100);assert.equal(ocrMonth(new Date('2026-09-30T15:00:00Z')),'2026-10');});

test('keeps note fragments inside the numbered schedule and skips a team heading',()=>{
 const data=sample(2),cells=data.images[0].tables[0].cells;
 for(const c of cells){
  if(c.rowIndex===2)c.rowIndex=5;
  else if(c.rowIndex===1){c.rowIndex=2;if(c.columnIndex<=5)c.rowSpan=3;}
 }
 cells.push(cell(1,0,'B팀',{columnSpan:7}),cell(3,6,'긴 메모 둘째 줄'),cell(4,6,'다음 일정과 섞이지 않는 메모'));
 const draft=parseClovaSchedule(data);
 assert.deepEqual(draft.folders.map(row=>row.sourceNumber),[1,2]);
 assert.equal(draft.folders[0].notes,'방문 전 연락\n긴 메모 둘째 줄\n다음 일정과 섞이지 않는 메모');
 assert.equal(draft.folders[1].notes,'방문 전 연락');
 assert.deepEqual(draft.folders.map(row=>row.group),[2,2]);
});

test('a blank full-width merged row splits teams without becoming an appointment',()=>{
 const data=sample(3),cells=data.images[0].tables[0].cells;
 for(const c of cells){if(c.rowIndex===3){c.rowIndex=4;if(c.columnIndex===0)c.cellTextLines=[{cellWords:[{inferText:'1'}]}];}}
 cells.push(cell(3,0,'',{columnSpan:7}));
 const draft=parseClovaSchedule(data);
 assert.deepEqual(draft.folders.map(row=>[row.group,row.sourceNumber]),[[1,1],[1,2],[2,1]]);
});

test('blue or labelled building sections do not split teams even when the printed number restarts',()=>{
 for(const heading of ['', '구분건물']){
  const data=sample(2),cells=data.images[0].tables[0].cells;
  cells.find(c=>c.rowIndex===1&&c.columnIndex===5).cellTextLines=[{cellWords:[{inferText:'여고로 117'}]}];
  for(const c of cells.filter(c=>c.rowIndex===2)){c.rowIndex=3;if(c.columnIndex===0)c.cellTextLines=[{cellWords:[{inferText:'1'}]}];}
  cells.push(cell(2,0,heading,{columnSpan:7}));
  assert.deepEqual(parseClovaSchedule(data).folders.map(row=>row.group),[1,1]);
 }
});
