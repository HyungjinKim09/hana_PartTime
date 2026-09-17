import type {Folder} from './types';
import {normalizeRoadAddress} from './address.js';
export const SURVEY_STATUSES=['완료','취소','연기','미완료'] as const;
export function surveyStatus(value?:string){return SURVEY_STATUSES.find(s=>s===value)||'미완료';}
export function buildingCategory(f:Pick<Folder,'unit'|'address'>){return /[0-9０-９]+(?:[-–][0-9０-９]+)?\s*호(?!선)/u.test([f.unit,f.address].filter(Boolean).join(' '))?'구분건물':'일반건물';}
export function dailyReport(region:string,date:string,folders:Folder[]){
  const day=new Date(date+'T00:00:00Z');if(Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==date)throw new Error('조사 날짜를 확인해 주세요.');
  const items=folders.filter(f=>f.region===region&&f.date===date);
  const lines=[`${day.getUTCMonth()+1}/${day.getUTCDate()}(${'일월화수목금토'[day.getUTCDay()]}) ${region} 현장조사 일일보고`,''];
  const groups=['일반건물','구분건물'].map(category=>({category,rows:items.filter(f=>buildingCategory(f)===category)})).filter(g=>g.rows.length>0);
  for(const {category,rows} of groups){
    if(groups.length>1)lines.push(category);
    rows.forEach((f,i)=>{
      const place=category==='구분건물'?(f.unit||f.address):normalizeRoadAddress(f.address);
      const heading=`${i+1}.${f.lot}${place?`(${place})`:''}`;
      const detail=f.buildingDetails?.trim();
      lines.push(`${heading} - ${surveyStatus(f.surveyStatus)}/${detail?detail+'/':''}${f.remarks?.trim()||'특이사항 없음'}`);
    });lines.push('');
  }
  lines.push('이상입니다.');return lines.join('\n');
}
