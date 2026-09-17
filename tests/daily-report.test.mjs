import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyReport,buildingCategory} from '../lib/daily-report.ts';
const base={id:'a',region:'망미5구역',date:'2026-09-17',lot:'망미동 937-224',address:'톳고개로 68-5',notes:'방문 전 연락 요망',group:1,time:'10:00',name:'',phones:[],count:0,bytes:0};
test('report separates buildings by unit, preserves remarks and defaults empty remarks',()=>{
 const text=dailyReport(base.region,base.date,[{...base,buildingDetails:'1동3층',surveyStatus:'완료',remarks:'보일러는 심야보일러를 합쳐 4개.\n화분의 나무는 별도 작성함.'},{...base,id:'b',lot:'망미동 937-020',unit:'영미주택 101호',surveyStatus:'완료',remarks:'  '},{...base,id:'c',lot:'망미동 937-020',unit:'영미주택 102호',surveyStatus:'완료'},{...base,id:'x',date:'2026-09-18',remarks:'다른 날'}]);
 assert.match(text,/9\/17\(목\) 망미5구역 현장조사 일일보고/);
 assert.match(text,/일반건물\n1\.망미동 937-224\(톳고개로 68-5\) - 완료 \/ 1동3층 \/ 보일러/);
 assert.match(text,/구분건물\n1\.망미동 937-020\(영미주택 101호\) - 완료 \/ 특이사항 없음\n2\./);
 assert.ok(!text.includes('방문 전 연락'));assert.ok(!text.includes('다른 날'));assert.ok(text.endsWith('이상입니다.'));
});
test('classifies legacy address-only unit data and never guesses completion',()=>{
 assert.equal(buildingCategory({...base,address:'배산 101호'}),'구분건물');assert.equal(buildingCategory({...base,address:'과정로73번길 16-5'}),'일반건물');
 assert.match(dailyReport(base.region,base.date,[base]),/미완료 \/ 특이사항 없음/);
});
