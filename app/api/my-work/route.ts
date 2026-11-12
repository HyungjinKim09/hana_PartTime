import {identityUser,storage,json,failure,ApiError} from '@/lib/storage';
import {normalizeRoadAddress} from '@/lib/address';
import {buildingCategory,dailyReport} from '@/lib/daily-report';
import {folderView,type FolderRow} from '@/lib/folders';

type PersonalReportRow=FolderRow&{personal_remarks:string;personal_details:string;personal_status:string;personal_restored:number};
type ScheduleOrderRow=Pick<FolderRow,'id'|'region'|'unit'|'address'>;

export async function GET(request:Request){try{
 const user=await identityUser(request),{db}=storage(),params=new URL(request.url).searchParams,actor=user.memberId||'admin';
 const mode=params.get('mode')||'folders';
 const allowed=mode==='report'?['mode','q','limit','cursor','region','date']:['mode','q','limit','cursor'];
 if([...params.keys()].some(key=>!allowed.includes(key)))throw new ApiError('내 작업 조회 조건을 확인해 주세요.');
 if(mode==='report'){
  const region=params.get('region'),selectedDate=params.get('date');
  if(region!==null||selectedDate!==null){
   const day=new Date((selectedDate||'')+'T00:00:00Z');
   if(!region?.trim()||region.length>500||!selectedDate||!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)||
     Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==selectedDate){
    throw new ApiError('일일보고를 복사할 지역과 날짜를 확인해 주세요.');
   }
  }
  const date=selectedDate??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const regionFilter=region!==null?'AND f.region=?4':'';
  const reportBindings=[user.owner,actor,date,...(region!==null?[region]:[])];
  const [personal,scheduled]=await db.batch<PersonalReportRow|ScheduleOrderRow>([
    db.prepare(`SELECT f.*,r.remarks AS personal_remarks,r.building_details AS personal_details,
      r.survey_status AS personal_status,r.restored AS personal_restored
    FROM personal_survey_records r JOIN survey_folders f ON f.owner=r.owner AND f.id=r.folder_id
    WHERE r.owner=?1 AND r.actor_id=?2 AND f.survey_date=?3 AND f.deleting=0 ${regionFilter}
    ORDER BY f.region,f.group_index,f.sort_index,f.id LIMIT 2001`).bind(...reportBindings),
    // Include all scheduled folders in the actor's relevant regions to preserve shared ordinals.
    db.prepare(`WITH regions AS MATERIALIZED (
      SELECT DISTINCT f.region FROM personal_survey_records r
      JOIN survey_folders f ON f.owner=r.owner AND f.id=r.folder_id
      WHERE r.owner=?1 AND r.actor_id=?2 AND f.survey_date=?3 AND f.deleting=0 AND f.manual_added=0 ${regionFilter}
    )
    SELECT f.id,f.region,f.unit,f.address FROM regions r CROSS JOIN survey_folders f
    WHERE f.owner=?1 AND f.region=r.region AND f.survey_date=?3 AND f.deleting=0 AND f.manual_added=0
    ORDER BY f.region,COALESCE(json_extract(f.created_by,'$.at'),''),f.sort_index,f.group_index,f.lot,f.id`)
      .bind(...reportBindings),
  ]);
  const rows=personal.results as PersonalReportRow[];
  if(rows.length>2000)throw new ApiError('보고할 일정이 너무 많습니다. 관리자에게 문의해 주세요.',413);
  const counts=new Map<string,number>(),numbers=new Map<string,number>();
  const personalIds=new Set(rows.map(row=>row.id));
  for(const row of scheduled.results){
    const category=buildingCategory({unit:row.unit,address:normalizeRoadAddress(row.address)});
    const key=JSON.stringify([row.region,category]);
    const number=(counts.get(key)??0)+1;
    counts.set(key,number);
    if(personalIds.has(row.id))numbers.set(row.id,number);
  }
  const folders=rows.map(row=>folderView({...row,remarks:row.personal_remarks,building_details:row.personal_details,survey_status:row.personal_status})),regions=[...new Set(folders.map(f=>f.region))];
  return json({date,count:folders.length,regions:regions.length,text:regions.map(region=>dailyReport(region,date,folders,numbers)).join('\n\n'),pending:folders.filter(f=>f.surveyStatus==='미완료').length,restored:rows.filter(r=>r.personal_restored).length});
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
