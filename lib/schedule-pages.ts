import type {ScheduleDraft} from './types';

export const schedulePhotoLimit=10;
export const schedulePhotoBytes=20*1024*1024;

export function checkSchedulePhotos(photos:readonly {size:number}[]){
  if(!photos.length||photos.length>schedulePhotoLimit)throw Error(`일정표 사진을 1~${schedulePhotoLimit}장 선택해 주세요.`);
  if(photos.some(photo=>photo.size===0)||photos.reduce((size,photo)=>size+photo.size,0)>schedulePhotoBytes){
    throw Error('일정표 사진의 전체 크기는 20MB 이하여야 합니다.');
  }
}

export function readScheduleNumber(text:string){
  const match=text.normalize('NFKC').trim().match(/^([1-9]\d{0,2})[.)]?$/);
  return match?Number(match[1]):undefined;
}

export function mergeSchedulePages(drafts:readonly ScheduleDraft[]):ScheduleDraft{
  const regions=new Set(drafts.map(draft=>draft.region.trim().replace(/\s+(?=\d*\s*구역$)/g,'')).filter(Boolean));
  const dates=new Set(drafts.map(draft=>draft.date).filter(Boolean));
  if(regions.size>1||dates.size>1)throw Error('사진마다 조사 구역 또는 날짜가 다릅니다. 같은 구역·날짜의 일정표를 선택해 주세요.');
  const pages=drafts.map((draft,index)=>{
    const numbers=draft.folders.flatMap(folder=>folder.sourceNumber===undefined?[]:[folder.sourceNumber]);
    const ordered=numbers.length>0&&numbers.every((number,i)=>i===0||number>numbers[i-1]);
    return {draft,index,first:ordered?numbers[0]:undefined,last:ordered?numbers.at(-1):undefined};
  });
  const numbered=pages.toSorted((a,b)=>(a.first??Infinity)-(b.first??Infinity));
  const order=numbered.every((page,i)=>page.first!==undefined&&(i===0||numbered[i-1].last!<page.first))?numbered:pages;
  const folders=order.flatMap(({draft,index})=>draft.folders.map(folder=>({...folder,sourcePage:index+1})));
  if(folders.length>100)throw Error('일정이 100개를 넘습니다. 사진을 나눠 등록해 주세요.');
  const warnings=pages.flatMap(({draft,index})=>draft.warnings.map(warning=>
    (drafts.length>1?`사진 ${index+1}: ${warning}`:warning).slice(0,500)));
  return {region:[...regions][0]||'',date:[...dates][0]||'',folders,warnings:warnings.slice(0,100)};
}
