import type {ScheduleDraft} from './types';
import {buildingCategory} from './daily-report.ts';

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

export function readScheduleTeam(text:string){
  const match=text.normalize('NFKC').trim().match(/^([A-T])\s*팀$/i);
  return match?match[1].toUpperCase().charCodeAt(0)-64:undefined;
}

export const scheduleTeamLabel=(group:number)=>String.fromCharCode(64+group)+'팀';

export function assignScheduleTeams(folders:ScheduleDraft['folders'],dividers:ReadonlyMap<number,string>){
  const starts=[...new Set([0,...dividers.keys()])].filter(index=>index<folders.length).sort((a,b)=>a-b);
  const categories=starts.map((start,i)=>{
    const values=new Set(folders.slice(start,starts[i+1]).map(buildingCategory));
    return values.size===1?[...values][0]:undefined;
  });
  let team=1;
  for(const [i,start] of starts.entries()){
    const label=dividers.get(start)??'',explicit=readScheduleTeam(label);
    const buildingDivider=/^(?:일반|구분)\s*건물/.test(label.trim())||
      (categories[i-1]!==undefined&&categories[i]!==undefined&&categories[i-1]!==categories[i]);
    if(explicit!==undefined)team=explicit;
    else if(i>0&&!buildingDivider&&folders[start].sourceNumber===1)team=Math.min(20,team+1);
    for(const row of folders.slice(start,starts[i+1]))row.group=team;
  }
}

export function mergeSchedulePages(drafts:readonly ScheduleDraft[]):ScheduleDraft{
  const regions=new Set(drafts.map(draft=>draft.region.trim().replace(/\s+(?=\d*\s*구역$)/g,'')).filter(Boolean));
  const dates=new Set(drafts.map(draft=>draft.date).filter(Boolean));
  if(regions.size>1||dates.size>1)throw Error('사진마다 조사 구역 또는 날짜가 다릅니다. 같은 구역·날짜의 일정표를 선택해 주세요.');
  const pages=drafts.map((draft,index)=>{
    const numbers=draft.folders.flatMap(folder=>folder.sourceNumber===undefined?[]:[folder.sourceNumber]);
    const ordered=numbers.length>0&&numbers.every((number,i)=>i===0||number>numbers[i-1]);
    return {draft,index,first:ordered?numbers[0]:undefined,last:ordered?numbers.at(-1):undefined,
      start:draft.folders[0],end:draft.folders.at(-1)};
  });
  const numbered=pages.toSorted((a,b)=>(a.first??Infinity)-(b.first??Infinity));
  let order=numbered.every((page,i)=>page.first!==undefined&&(i===0||numbered[i-1].last!<page.first))?numbered:pages;
  // A team or building divider can restart numbering halfway down the page.
  // Anchor a uniquely numbered first page, then match its continuation by the last team's number.
  const starts=pages.filter(page=>page.start?.sourceNumber===1);
  if(starts.length===1&&pages.length>1){
    const chain=[starts[0]],left=pages.filter(page=>page!==starts[0]);
    while(left.length){
      const last=chain.at(-1)?.end?.sourceNumber;
      if(last===undefined)break;
      const next=left.filter(page=>page.start?.sourceNumber===last+1);
      if(next.length!==1)break;
      chain.push(next[0]);left.splice(left.indexOf(next[0]),1);
    }
    if(!left.length)order=chain;
  }
  const folders:ScheduleDraft['folders']=[];
  for(const {draft,index,start} of order){
    const previous=folders.at(-1);
    const continues=previous?.sourceNumber!==undefined&&start?.sourceNumber===previous.sourceNumber+1;
    const offset=continues&&(start.group??1)===1?previous.group-1:0;
    for(const folder of draft.folders)folders.push({...folder,group:Math.min(20,(folder.group??1)+offset),sourcePage:index+1});
  }
  if(folders.length>100)throw Error('일정이 100개를 넘습니다. 사진을 나눠 등록해 주세요.');
  const warnings=pages.flatMap(({draft,index})=>draft.warnings.map(warning=>
    (drafts.length>1?`사진 ${index+1}: ${warning}`:warning).slice(0,500)));
  return {region:[...regions][0]||'',date:[...dates][0]||'',folders,warnings:warnings.slice(0,100)};
}
