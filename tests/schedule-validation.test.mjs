import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule} from '../lib/schedule-input.ts';
import {scheduleFieldErrors} from '../lib/schedule-validation.ts';
const row={lot:'사직동 1-1',unit:'',time:'',name:'',phones:[],address:'',notes:'',group:1};
test('required and malformed dates point to the actual schedule fields',()=>{
 let failure;try{validateSchedule({region:'',date:'2026-02-30',folders:[{...row,lot:''}]});}catch(error){failure=error;}
 const errors=scheduleFieldErrors(failure);
 assert.ok(errors.region);assert.ok(errors.date);assert.ok(errors['folders.0.lot']);
});
test('duplicate units identify the later conflicting row',()=>{
 let failure;try{validateSchedule({region:'사직4구역',date:'2026-11-19',folders:[row,{...row}]});}catch(error){failure=error;}
 assert.match(scheduleFieldErrors(failure)['folders.1.unit'],/같은 번지/);
});
test('array limits describe item counts and text limits describe characters',()=>{
 let failure;try{validateSchedule({region:'사직4구역',date:'2026-11-20',folders:[{...row,phones:Array(11).fill('010-0000-0000'),notes:'x'.repeat(3001)}]});}catch(error){failure=error;}
 const errors=scheduleFieldErrors(failure);
 assert.match(errors['folders.0.phones'],/10개/);
 assert.match(errors['folders.0.notes'],/3000자/);
});
