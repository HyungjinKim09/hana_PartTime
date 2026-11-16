import {scheduleTeamLabel} from '@/lib/schedule-pages';

export function ScheduleTeamSelect({value,existingTeam,onChange}:{value:number|null;existingTeam?:number|null;onChange:(team:number|null)=>void}){
  const teams=[...new Set([1,2,existingTeam??1,value??1])];
  return <select className="schedule-team-select" value={value??''} onChange={event=>onChange(event.target.value?Number(event.target.value):null)}>
    <option value="">팀 미지정</option>
    {teams.map(team=><option key={team} value={team}>{scheduleTeamLabel(team)}</option>)}
  </select>;
}
