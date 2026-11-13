'use client';
import {useRef,useState} from 'react';
import {toast} from 'sonner';
import type {DailyReportSection} from '@/lib/daily-report';
import {scheduleTeamLabel} from '@/lib/schedule-pages';

export function ReportSections({sections,text,title,personal=false}:{sections?:DailyReportSection[];text:string;title:string;personal?:boolean}){
 const [selected,setSelected]=useState(0);
 const area=useRef<HTMLTextAreaElement>(null);
 const separated=!!sections?.some(section=>section.team>0);
 const current=separated?sections?.[selected]:undefined;
 const multipleRegions=new Set(sections?.map(section=>section.region)).size>1;
 const label=current?.team?scheduleTeamLabel(current.team):'';
 const content=current?.text??text;
 async function copy(){
  try{await navigator.clipboard.writeText(content);toast.success('일일보고를 복사했어요.');}
  catch{area.current?.focus();area.current?.select();toast.info('선택된 내용을 복사해 주세요.');}
 }
 return <>
  {separated&&sections&&sections.length>1&&<div className="schedule-team-filters" role="group" aria-label="보고서 선택">
   {sections.map(({region,team,count},index)=><button key={`${region}/${team}`} className={index===selected?'primary-button':'secondary-button'} aria-pressed={index===selected} onClick={()=>{setSelected(index);if(area.current)area.current.scrollTop=0;}}>
    {multipleRegions?region+' ':''}{team?scheduleTeamLabel(team):'팀 미지정'} · {count}건
   </button>)}
  </div>}
  <textarea ref={area} className="report-text" aria-label={title+' 내용'} readOnly value={content}/>
  <button className="primary-button" onClick={()=>void copy()}>{[label,personal?'내 일일보고 복사':'일일보고 복사'].filter(Boolean).join(' ')}</button>
 </>;
}
