import {identityUser,storage,json,failure,ApiError} from '@/lib/storage';
import {dailyReport} from '@/lib/daily-report';
import {folderView,type FolderRow} from '@/lib/folders';
export async function GET(request:Request){try{
 const user=await identityUser(request),{db}=storage(),params=new URL(request.url).searchParams,actor=user.memberId||'admin';
 if([...params.keys()].some(key=>!['mode','q','limit','cursor'].includes(key)))throw new ApiError('내 작업 조회 조건을 확인해 주세요.');
 const mode=params.get('mode')||'folders';
 if(mode==='report'){
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  // Number the full schedule in each relevant region before selecting the actor's rows.
  const rows=await db.prepare(`WITH own AS MATERIALIZED (
    SELECT f.*,r.remarks AS personal_remarks,r.building_details AS personal_details,
      r.survey_status AS personal_status,r.restored AS personal_restored
    FROM personal_survey_records r JOIN survey_folders f ON f.owner=r.owner AND f.id=r.folder_id
    WHERE r.owner=?1 AND r.actor_id=?2 AND f.survey_date=?3 AND f.deleting=0 LIMIT 2001
  ), regions AS MATERIALIZED (SELECT DISTINCT region FROM own WHERE manual_added=0),
  numbered AS MATERIALIZED (
    SELECT f.id, ROW_NUMBER() OVER (
      PARTITION BY f.region ORDER BY COALESCE(json_extract(f.created_by,'$.at'),''),
        f.sort_index,f.group_index,f.lot,f.id
    ) AS schedule_number
    FROM regions r CROSS JOIN survey_folders f
    WHERE f.owner=?1 AND f.region=r.region AND f.survey_date=?3 AND f.deleting=0 AND f.manual_added=0
  )
  SELECT own.*,numbered.schedule_number FROM own LEFT JOIN numbered ON numbered.id=own.id
  ORDER BY own.region,numbered.schedule_number IS NULL,numbered.schedule_number,own.group_index,own.sort_index,own.id`)
    .bind(user.owner,actor,date)
    .all<FolderRow&{personal_remarks:string;personal_details:string;personal_status:string;personal_restored:number;schedule_number:number|null}>();
  if(rows.results.length>2000)throw new ApiError('보고할 일정이 너무 많습니다. 관리자에게 문의해 주세요.',413);
  const numbers=new Map(rows.results.flatMap(row=>row.schedule_number===null?[]:[[row.id,row.schedule_number] as const]));
  const folders=rows.results.map(row=>folderView({...row,remarks:row.personal_remarks,building_details:row.personal_details,survey_status:row.personal_status})),regions=[...new Set(folders.map(f=>f.region))];
  return json({date,count:folders.length,regions:regions.length,text:regions.map(region=>dailyReport(region,date,folders,numbers)).join('\n\n'),pending:folders.filter(f=>f.surveyStatus==='미완료').length,restored:rows.results.filter(r=>r.personal_restored).length});
 }
 if(mode!=='folders')throw new ApiError('내 작업 조회 조건을 확인해 주세요.');
 const limit=Number(params.get('limit')||50),q=(params.get('q')||'').trim();if(!Number.isInteger(limit)||limit<1||limit>100||q.length>150)throw new ApiError('폴더 조회 범위를 확인해 주세요.');
 let cursor:{at:string;id:string}|undefined;if(params.has('cursor')){try{const raw=params.get('cursor')!;if(raw.length>400)throw Error();const value=JSON.parse(raw);if(typeof value.at!=='string'||typeof value.id!=='string'||value.at.length>50||value.id.length>150)throw Error();cursor=value;}catch{throw new ApiError('다음 폴더 조회를 다시 시작해 주세요.');}}
 // Materialize once: total and page must not each scan the actor's complete
 // activity history. Drawings alone are not evidence of field investigation.
 const result=await db.prepare(`WITH participation AS MATERIALIZED (
  SELECT folder_id,MAX(created_at) AS worked_at FROM (
   SELECT folder_id,created_at FROM activity_log WHERE owner=? AND actor_id=? AND status='complete'
    AND (action='survey.updated' OR (action='photo.added' AND target_type='photo'))
   UNION ALL SELECT folder_id,updated_at FROM personal_survey_records WHERE owner=? AND actor_id=?
  ) GROUP BY folder_id
 ),matched AS MATERIALIZED (
  SELECT f.id,f.region,f.survey_date AS date,f.lot,f.unit,f.time,f.survey_status AS surveyStatus,
   COALESCE(s.count,0) AS count,w.worked_at AS workedAt
   FROM participation w CROSS JOIN survey_folders f LEFT JOIN folder_stats s ON s.owner=f.owner AND s.folder=f.id
   WHERE f.owner=? AND f.id=w.folder_id AND f.deleting=0
    AND instr(lower(f.region||' '||f.lot||' '||f.unit||' '||f.address),lower(?))>0
 ) SELECT (SELECT COUNT(*) FROM matched) AS total,
  (SELECT json_group_array(json_object('id',id,'region',region,'date',date,'lot',lot,'unit',unit,'time',time,'surveyStatus',surveyStatus,'count',count,'workedAt',workedAt))
   FROM (SELECT * FROM matched ${cursor?'WHERE (workedAt,id)<(?,?)':''} ORDER BY workedAt DESC,id DESC LIMIT ?)) AS folders`)
  .bind(user.owner,actor,user.owner,actor,user.owner,q,...(cursor?[cursor.at,cursor.id]:[]),limit+1).first<{total:number;folders:string}>();
 const rows=JSON.parse(result?.folders||'[]') as {id:string;region:string;date:string;lot:string;unit:string;time:string;surveyStatus:string;count:number;workedAt:string}[];
 const folders=rows.slice(0,limit),last=folders.at(-1);return json({folders,total:result?.total||0,nextCursor:rows.length>limit&&last?JSON.stringify({at:last.workedAt,id:last.id}):null});
}catch(e){return failure(e);}}
