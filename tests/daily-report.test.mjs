import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyReport,buildingCategory,exportFolderLabel,SURVEY_STATUSES,surveyStatus} from '../lib/daily-report.ts';
const base={id:'a',region:'망미5구역',date:'2026-09-17',lot:'망미동 937-224',address:'톳고개로 68-5',notes:'방문 전 연락 요망',group:1,time:'10:00',name:'',phones:[],count:0,bytes:0};
test('download names use lot addresses for general buildings and only unit numbers for apartments',()=>{
 assert.equal(exportFolderLabel(base),'망미동 937-224');
 assert.equal(exportFolderLabel({...base,unit:'배산301호'}),'301호');
 assert.equal(exportFolderLabel({...base,unit:'아림파크 2동 215호'}),'215호');
 assert.equal(exportFolderLabel({...base,address:'영미주택 101호'}),'101호');
});
test('report separates buildings by unit, preserves remarks and defaults empty remarks',()=>{
 const text=dailyReport(base.region,base.date,[{...base,buildingDetails:'1동3층',surveyStatus:'완료',remarks:'보일러는 심야보일러를 합쳐 4개.\n화분의 나무는 별도 작성함.'},{...base,id:'b',lot:'망미동 937-020',unit:'영미주택 101호',surveyStatus:'완료',remarks:'  '},{...base,id:'c',lot:'망미동 937-020',unit:'영미주택 102호',surveyStatus:'완료'},{...base,id:'x',date:'2026-09-18',remarks:'다른 날'}]);
 assert.match(text,/9\/17\(목\) 망미5구역 현장조사 일일보고/);
 assert.match(text,/일반건물\n1\.망미동 937-224\(톳고개로 68-5\) - 완료\/1동3층\/보일러/);
 assert.match(text,/구분건물\n1\.망미동 937-020\(영미주택 101호\) - 완료\/특이사항 없음\n2\./);
 assert.ok(!text.includes('방문 전 연락'));assert.ok(!text.includes('다른 날'));assert.ok(text.endsWith('이상입니다.'));
});
test('classifies legacy address-only unit data and never guesses completion',()=>{
 assert.equal(buildingCategory({...base,address:'배산 101호'}),'구분건물');assert.equal(buildingCategory({...base,address:'과정로73번길 16-5'}),'일반건물');
 assert.match(dailyReport(base.region,base.date,[base]),/미완료\/특이사항 없음/);
});
test('prints cancellation remarks and omits section headings for one building type',()=>{
 const text=dailyReport('명장2구역','2026-09-15',[{...base,region:'명장2구역',date:'2026-09-15',lot:'명장동 497-076',unit:'아림파크 2동 312호',surveyStatus:'취소',remarks:'현장 부재'}]);
 assert.equal(text,'9/15(화) 명장2구역 현장조사 일일보고\n\n1.명장동 497-076(아림파크 2동 312호) - 취소/현장 부재\n\n이상입니다.');
 assert.ok(!text.includes('해당 없음'));assert.ok(!text.includes('구분건물'));
 const general=dailyReport(base.region,base.date,[{...base,surveyStatus:'연기',remarks:'다음 날 방문'}]);assert.ok(!general.includes('일반건물'));assert.match(general,/연기\/다음 날 방문/);
});
test('only the four requested statuses are selectable',()=>{
 assert.deepEqual(SURVEY_STATUSES,['완료','취소','연기','미완료']);assert.equal(surveyStatus('부분조사'),'미완료');assert.equal(surveyStatus('미방문'),'미완료');
});

test('manual additions have their own numbered report section after scheduled buildings',()=>{
 const text=dailyReport(base.region,base.date,[base,{...base,id:'extra',lot:'망미동 937-029',unit:'만주골든빌B동201호',unitDisplay:'만주골든빌 B동 201호',manualAdded:true,surveyStatus:'완료',remarks:''},{...base,id:'extra2',lot:'망미동 938-1',manualAdded:true,surveyStatus:'연기',remarks:'다음 주 방문'}]);
 assert.match(text,/추가일정\n\n1\. 망미동 937-029\(만주골든빌 B동 201호\) - 완료 \/ 특이사항 없음\n2\. 망미동 938-1/);
 assert.equal(text.split('망미동 937-029').length,2);assert.ok(text.indexOf('망미동 937-224')<text.indexOf('추가일정'));assert.match(text,/연기 \/ 다음 주 방문/);
});
test('manual-only report retains pending status and omits empty standard sections',()=>{
 const text=dailyReport(base.region,base.date,[{...base,manualAdded:true}]);
 assert.match(text,/추가일정\n\n1\./);assert.match(text,/미완료 \/ 특이사항 없음/);assert.ok(!text.includes('일반건물'));assert.ok(!text.includes('구분건물'));
 assert.ok(!dailyReport(base.region,base.date,[base]).includes('추가일정'));
});
