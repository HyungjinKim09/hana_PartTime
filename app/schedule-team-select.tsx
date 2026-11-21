import {useId} from 'react';
import {scheduleTeamLabel} from '@/lib/schedule-pages';

export function ScheduleTeamSelect({value,existingTeam,onChange,id,name,label,error,disabled=false}:{value:number|null;existingTeam?:number|null;onChange:(team:number|null)=>void;id?:string;name?:string;label?:string;error?:string;disabled?:boolean}){
  const generatedId=useId(),controlId=id||generatedId,errorId=error?controlId+'-error':undefined;
  const teams=[...new Set([1,2,existingTeam??1,value??1])];
  const select=<select id={controlId} name={name} className="schedule-team-select" value={value??''} disabled={disabled} aria-invalid={error?true:undefined} aria-describedby={errorId} onChange={event=>onChange(event.target.value?Number(event.target.value):null)}>
      <option value="">팀 미지정</option>
      {teams.map(team=><option key={team} value={team}>{scheduleTeamLabel(team)}</option>)}
    </select>;
  return label?<div className="schedule-field"><label htmlFor={controlId}>{label}</label>{select}{error&&<small id={errorId} className="field-error">{error}</small>}</div>:select;
}
