import {z} from 'zod';
import {normalizeRoadAddress} from './address.js';
const clean=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ');
const component=z.string().transform(clean).pipe(z.string().min(1).max(100).refine(s=>!/[\\/<>:"|?*\x00-\x1f]/.test(s)&&s!=='.'&&s!=='..','폴더 이름에는 경로 기호를 사용할 수 없습니다.'));
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'조사 날짜를 확인해 주세요.').refine(s=>{const d=new Date(s+'T00:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;},'존재하지 않는 날짜입니다.');
const scheduleFolder=z.object({
  lot:component.transform(s=>s.replace(/([가-힣])\s*(\d)/g,'$1 $2').replace(/\s*-\s*/g,'-')),
  unit:z.union([z.literal(''),component]).default('').transform(s=>s.replace(/\s+/g,'')),
  time:z.string().max(100),name:z.string().max(100),phones:z.array(z.string().max(80)).max(10),address:z.string().max(300).transform(normalizeRoadAddress),notes:z.string().max(3000),group:z.number().int().min(1).max(20),
});
const schema=z.object({region:component,date,folders:z.array(scheduleFolder).min(1,'일정이 한 개 이상 필요합니다.').max(100),warnings:z.array(z.string().max(500)).max(100).default([])});
export function validateSchedule(input:unknown){const draft=schema.parse(input);const keys=new Set<string>();for(const f of draft.folders){const key=JSON.stringify([f.lot,f.unit]);if(keys.has(key))throw new Error('같은 번지의 일정은 건물·호수를 다르게 입력해 주세요.');keys.add(key);}return draft;}

const editSchema=scheduleFolder.omit({group:true}).extend({
  id:z.string().min(1).max(150),revision:z.number().int().positive(),region:component,date,
}).strict();
export function validateScheduleEdit(input:unknown){
  const draft=editSchema.parse(input);
  return {...draft,unitDisplay:clean((input as {unit?:string}).unit||''),phones:draft.phones.map(clean).filter(Boolean)};
}
