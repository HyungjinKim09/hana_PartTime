import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoadAddress} from '../lib/address.js';
import {validateSchedule} from '../lib/schedule-input.ts';
import {dailyReport} from '../lib/daily-report.ts';
test('repairs OCR spacing while keeping road and building numbers distinct',()=>{
 const pairs=[['톳 고 개 로 6 8 - 5','톳고개로 68-5'],['과 정 로 7 3 번 길 1 6 - 5','과정로73번길 16-5'],['중 앙 대 로 1267 번 길 39 - 5','중앙대로1267번길 39-5'],['여 고 로 127 번 길 12-3','여고로127번길 12-3'],['부산광역시 수영구 과 정 로 73 번 길 16-5','부산광역시 수영구 과정로73번길 16-5'],['과정로73번길 16-5','과정로73번길 16-5'],['아림파크 2동 215호','아림파크 2동 215호'],['강변대로 12 (망미동)','강변대로 12 (망미동)']];
 for(const [raw,expected] of pairs){assert.equal(normalizeRoadAddress(raw),expected,raw);assert.equal(normalizeRoadAddress(expected),expected,'idempotent '+expected);}
});
test('normalizes new imports and legacy report addresses without touching remarks',()=>{
 const f={id:'test',region:'망미5구역',date:'2026-09-17',lot:'망미동 937-224',address:'톳 고 개 로 68-5',time:'',name:'',phones:[],notes:'방 문 전 연락',remarks:'보 일 러 확인',group:1,count:0,bytes:0};
 const imported=validateSchedule({region:f.region,date:f.date,folders:[f]});assert.equal(imported.folders[0].address,'톳고개로 68-5');assert.equal(imported.folders[0].notes,'방 문 전 연락');
 const text=dailyReport(f.region,f.date,[f]);assert.ok(text.includes('(톳고개로 68-5)'));assert.ok(text.includes('보 일 러 확인'));
});
test('preserves separate floor/unit numbers and already-correct prefixes',()=>{
 for(const text of ['과정로 16-5 1층','강변대로 12 101동 205호','서울 강남대로 123'])assert.equal(normalizeRoadAddress(text),text);
});
