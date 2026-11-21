const labels:Record<string,string>={region:'지역 폴더',date:'조사 날짜',lot:'번지',unit:'건물·호수',time:'방문 시간',name:'연락 대상',phones:'전화번호',address:'주소',notes:'방문 전 확인사항',team:'조사 팀'};
export function scheduleFieldErrors(error:unknown):Record<string,string>{
 if(!error||typeof error!=='object'||!('issues' in error)||!Array.isArray(error.issues))return {};
 const result:Record<string,string>={};
 for(const issue of error.issues){
  const path=issue.path as (string|number)[];
  if(!Array.isArray(path))continue;
  // Multiple phone strings share one comma-separated input.
  const parts=path.at(-2)==='phones'?path.slice(0,-1):path;
  const name=parts.join('.'),label=labels[String(parts.at(-1))]||'입력값';
  result[name]??=/[가-힣]/.test(issue.message)?issue.message:`${label} 항목을 확인해 주세요.${issue.maximum?` 최대 ${issue.maximum}${issue.type==='array'?'개':'자'}까지 입력할 수 있습니다.`:''}`;
 }
 return result;
}
