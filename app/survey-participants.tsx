import {UserRound} from 'lucide-react';
import type {SurveyParticipant} from '@/lib/survey-participants';
export function SurveyParticipants({people,date,compact=false}:{people?:SurveyParticipant[];date?:string;compact?:boolean}){
 if(!people)return null;
 const Wrapper=compact?'span':'div';
 return <Wrapper className={compact?'folder-participants':'survey-participants-panel'} aria-label={date?`${date} 조사 인원`:'조사 인원'}>{compact&&date&&<small className="participants-day">{date}</small>}<strong className="participants-title"><UserRound size={14}/>{date&&!compact?date+' ':''}{people.length?`조사 인원 ${people.length}명`:'조사 인원 미기록'}</strong>{people.length?<span className="participants-names">{people.map(person=><span className="participant-person" key={person.id}>{person.name}{person.manual&&<small>관리자 지정</small>}{person.restored&&<small>복원 기록</small>}</span>)}</span>:<span className="participants-empty">{compact?'작업자 기록 없음':'현장 사진을 등록하거나 조사 기록을 저장하면 자동으로 표시됩니다.'}</span>}</Wrapper>;
}
