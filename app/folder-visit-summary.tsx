import {CheckCircle2,Clock,Circle} from 'lucide-react';
import type {Folder} from '@/lib/types';
import {surveyStatus} from '@/lib/daily-report';

/** Keep each schedule's status distinct when an address contains multiple visits. */
export function FolderVisitSummary({folders}:{folders:Folder[]}){
  if(!folders.length)return null;
  const single=folders.length===1?folders[0]:null;
  const completed=folders.filter(folder=>surveyStatus(folder.surveyStatus)==='완료').length;
  const done=completed===folders.length;
  return <div className="folder-visit-summary">
    {single&&<span className="folder-visit-time"><Clock size={14} aria-hidden="true"/>{single.time.trim()||'시간 미정'}</span>}
    <span className={'folder-visit-status'+(done?' is-complete':'')}>
      {done?<CheckCircle2 size={14} aria-hidden="true"/>:<Circle size={14} aria-hidden="true"/>}
      {single?surveyStatus(single.surveyStatus):`완료 ${completed}/${folders.length}건`}
    </span>
  </div>;
}
