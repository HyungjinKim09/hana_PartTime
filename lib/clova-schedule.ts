import {z} from 'zod';
import type {ScheduleDraft} from './types';
import {readScheduleNumber} from './schedule-pages.ts';

export function ocrMonth(date=new Date()){return new Date(date.getTime()+9*3600000).toISOString().slice(0,7);}
export function clovaConfig(env:{CLOVA_OCR_URL?:string;CLOVA_OCR_SECRET?:string;CLOVA_OCR_MONTHLY_LIMIT?:string}){
 if(!env.CLOVA_OCR_URL&&!env.CLOVA_OCR_SECRET)return null;
 const url=new URL(env.CLOVA_OCR_URL||'');
 if(url.protocol!=='https:'||!url.hostname.endsWith('.apigw.ntruss.com')||url.username||url.password||url.port||url.search||url.hash||!url.pathname.endsWith('/general')||!env.CLOVA_OCR_SECRET?.trim())throw Error('Invalid OCR configuration');
 const limit=Number(env.CLOVA_OCR_MONTHLY_LIMIT||100);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid OCR limit');
 return {url:url.toString(),secret:env.CLOVA_OCR_SECRET,limit};
}
const word=z.object({inferText:z.string().max(4000)});
const cell=z.object({rowIndex:z.number().int().min(0).max(500),columnIndex:z.number().int().min(0).max(30),rowSpan:z.number().int().min(1).max(100).default(1),columnSpan:z.number().int().min(1).max(30).default(1),inferConfidence:z.number().optional(),cellTextLines:z.array(z.object({cellWords:z.array(word).max(500)})).max(100).default([])});
const responseSchema=z.object({images:z.array(z.object({inferResult:z.literal('SUCCESS'),fields:z.array(word).max(10000).default([]),tables:z.array(z.object({cells:z.array(cell).max(3000)})).max(20).default([])})).length(1)});
const text=(c:z.infer<typeof cell>)=>c.cellTextLines.map(l=>l.cellWords.map(w=>w.inferText).join(' ')).join('\n').trim();
const compact=(s:string)=>s.replace(/\s+/g,'');
const lotMatch=(value:string)=>value.replace(/[–—]/g,'-').match(/(?:([가-힣]+동)\s*)?(?<![\d-])(\d{1,5})\s*-\s*(\d{1,4})(?![\d-])/);
export function parseClovaSchedule(input:unknown):ScheduleDraft{
 const parsed=responseSchema.safeParse(input);
 if(!parsed.success)throw Error('일정표 인식 결과가 불완전합니다. 원본을 확인하거나 직접 입력해 주세요.');
 const image=parsed.data.images[0],all=image.fields.map(f=>f.inferText).join(' ');
 const region=all.match(/([가-힣]+\s*\d*\s*구역)/)?.[1].replace(/\s/g,'')||'';
 const date=all.match(/(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/);
 const draft:ScheduleDraft={region,date:date?`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`:'',folders:[],warnings:['CLOVA 인식 결과입니다. 이름의 영문 표기·주소·방문 시간과 일정 수를 원본과 비교해 주세요.']};
 for(const table of image.tables){
  const cells=table.cells,lotHeader=cells.find(c=>compact(text(c))==='번지');
  if(!lotHeader)continue;
  const headers=cells.filter(c=>c.rowIndex===lotHeader.rowIndex);
  const find=(pattern:RegExp)=>headers.find(c=>pattern.test(compact(text(c))));
  const number=find(/^(번호|순번)$/),name=find(/^(성명|이름)$/),phone=find(/^연락처$/),time=find(/^(시간|방문시간)$/),address=find(/새주소|주소|비고/);
  if(!name||!phone||!time||!address)throw Error('일정표 열 구분을 확인하지 못했습니다. 원본을 보며 직접 입력해 주세요.');
  const headerEnd=Math.max(...headers.map(c=>c.rowIndex+c.rowSpan));
  const body=cells.filter(c=>c.rowIndex>=headerEnd&&text(c)).sort((a,b)=>a.rowIndex-b.rowIndex||a.columnIndex-b.columnIndex);
  const rows=Map.groupBy(body,c=>c.rowIndex);
  const schedules:{row:number;sourceNumber?:number;numberEnd?:number}[]=[];
  for(const [row,starts] of rows){
   const numberCell=starts.find(c=>c.columnIndex===number?.columnIndex&&c.columnSpan===1);
   const sourceNumber=numberCell?readScheduleNumber(text(numberCell)):undefined;
   const own=(column:number)=>starts.some(c=>c.columnIndex===column&&c.columnSpan===1);
   // A notes-only grid band can sit beneath cells spanning the full visit.
   // Only a new number or newly starting identity fields can open a visit.
   const hasLot=starts.some(c=>c.columnIndex===lotHeader.columnIndex&&c.columnSpan===1&&lotMatch(text(c)));
   const hasIdentity=hasLot||(own(name.columnIndex)&&(own(phone.columnIndex)||own(time.columnIndex)));
   if(sourceNumber!==undefined)schedules.push({row,sourceNumber,numberEnd:row+numberCell!.rowSpan});
   else if(hasIdentity&&row>=(schedules.at(-1)?.numberEnd??row))schedules.push({row});
  }
  for(const [i,schedule] of schedules.entries()){
   const start=i===0?headerEnd:schedule.row,end=schedules[i+1]?.row??Infinity;
   const rowCells=body.filter(c=>c.rowIndex<end&&c.rowIndex+c.rowSpan>start);
   const get=(column:number)=>rowCells.filter(c=>c.columnIndex===column).map(text).join('\n').trim();
   const match=lotMatch(get(lotHeader.columnIndex));
   const lot=match?`${match[1]?match[1]+' ':''}${match[2]}-${match[3]}`:'';
   const addr=get(address.columnIndex).replace(/\s+/g,' ').trim();
   const notes=rowCells.filter(c=>c.columnIndex>address.columnIndex).map(text).join('\n');
   const n=draft.folders.length+1;
   if(!lot||!match?.[1])draft.warnings.push(`일정 ${n}: 동 이름과 번지를 확인해 주세요.`);
   if(rowCells.some(c=>c.columnIndex>=lotHeader.columnIndex&&(c.rowSpan>1||c.columnSpan>1)))draft.warnings.push(`일정 ${n}: 합쳐진 셀이 있습니다. 주소·호수·메모를 확인해 주세요.`);
   if(rowCells.some(c=>c.inferConfidence!==undefined&&c.inferConfidence<.9))draft.warnings.push(`일정 ${n}: 흐린 글자가 있습니다. 원본과 비교해 주세요.`);
   const phoneText=compact(get(phone.columnIndex));
   draft.folders.push({lot,unit:/\d\s*호/.test(addr)?compact(addr):'',name:compact(get(name.columnIndex)),phones:phoneText.match(/0\d{1,2}-\d{3,4}-\d{4}/g)||[],time:compact(get(time.columnIndex)),address:addr,notes,group:1,sourceNumber:schedule.sourceNumber});
  }
 }
 if(!draft.folders.length)throw Error('일정표의 표를 찾지 못했습니다. 표 추출 설정을 확인하거나 직접 입력해 주세요.');
 if(draft.folders.length>100)throw Error('일정이 100개를 넘습니다. 사진을 나눠 주세요.');
 return draft;
}
