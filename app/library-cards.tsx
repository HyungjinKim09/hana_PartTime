import {Folder as FolderIcon,Image as ImageIcon,ChevronRight,Clock,CheckCircle2,Circle} from 'lucide-react';
import type {LibraryCard,LibrarySummary} from '@/lib/library-types';
import {DownloadSummary} from './folder-download-status';
import {SurveyParticipants} from './survey-participants';
export function LibraryVisitSummary({summary}:{summary:LibrarySummary}){return <span className="folder-visit-summary">{summary.schedules===1&&<span className="folder-visit-time"><Clock size={14}/>{summary.time?.trim()||'시간 미정'}</span>}<span className={'folder-visit-status'+(summary.completed===summary.schedules?' is-complete':'')}>{summary.completed===summary.schedules?<CheckCircle2 size={14}/>:<Circle size={14}/>} {summary.schedules===1?summary.status||'미완료':`완료 ${summary.completed}/${summary.schedules}건`}</span></span>;}
export function LibraryCards({cards,onOpen,search=false}:{cards:LibraryCard[];onOpen:(card:LibraryCard)=>void;search?:boolean}){
 if(!cards.length)return null;
 return <div className="library-records">
  <div className="library-record-columns" aria-hidden="true"><span>폴더</span><span>조사 상태</span><span>조사 인원</span><span>사진</span><span/></div>
  <ul>{cards.map(card=><li key={card.key}>
   <button className="library-record" onClick={()=>onOpen(card)}>
    <span className="library-record-name">
     <span className="library-record-icon"><FolderIcon size={19} aria-hidden="true"/></span>
     <span><strong>{card.label}</strong>
      {search&&<small>{card.target.region}{card.target.view==='date'?' · '+card.target.date:''}</small>}
      {(search&&card.unitCount||!card.leaf)?<small>{search&&card.unitCount?`총 ${card.unitCount}개 호수`:`${card.children}개 하위 일정·폴더`}</small>:null}
     </span>
    </span>
    <span className="library-record-status"><LibraryVisitSummary summary={card.summary}/><DownloadSummary summary={card.summary}/></span>
    <span className="library-record-people"><SurveyParticipants people={card.summary.participants} date={card.target.view==='address'?card.place?.date:undefined} compact/></span>
    <span className="library-record-photos"><ImageIcon size={15} aria-hidden="true"/>{card.summary.photos}장</span>
    <ChevronRight className="library-record-arrow" size={17} aria-hidden="true"/>
   </button>
  </li>)}</ul>
 </div>;
}
