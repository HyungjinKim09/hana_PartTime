import {z} from 'zod';
import {identity,storage,json,failure,limitedBody,ApiError} from '@/lib/storage';
import {findFolder} from '@/lib/folders';
import {SURVEY_STATUSES} from '@/lib/daily-report';
const update=z.object({id:z.string().min(1).max(150),revision:z.number().int().positive(),remarks:z.string().max(10000),buildingDetails:z.string().max(100),surveyStatus:z.enum(SURVEY_STATUSES)}).strict();
export async function PATCH(request:Request){try{
  const owner=await identity(request);const {db}=storage();
  let data;try{data=update.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,64000))));}catch{throw new ApiError('비고는 10,000자 이내로 입력하고 조사 상태를 확인해 주세요.');}
  if(!await findFolder(db,owner,data.id))throw new ApiError('폴더를 찾을 수 없습니다.',404);
  const changed=await db.prepare('UPDATE survey_folders SET remarks=?, building_details=?, survey_status=?,revision=revision+1 WHERE owner=? AND id=? AND revision=? AND deleting=0 RETURNING revision').bind(data.remarks,data.buildingDetails.trim(),data.surveyStatus,owner,data.id,data.revision).first<{revision:number}>();
  if(!changed){const latest=await findFolder(db,owner,data.id);return json({error:'다른 기기에서 변경된 내용이 있습니다. 최신 내용과 비교한 뒤 다시 저장해 주세요.',latest:latest?{remarks:latest.remarks,buildingDetails:latest.building_details,surveyStatus:latest.survey_status,revision:latest.revision}:null},409);}
  return json({saved:true,revision:changed.revision});
}catch(e){return failure(e);}}

const selectionSchema=z.object({ids:z.array(z.string().min(1).max(150)).min(1).max(10000)}).strict();
async function readSelection(request:Request){try{return [...new Set(selectionSchema.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,2*1024*1024)))).ids)];}catch{throw new ApiError('삭제할 일정 폴더를 선택해 주세요.');}}
export async function POST(request:Request){try{
  const owner=await identity(request),{db}=storage(),ids=JSON.stringify(await readSelection(request));
  const folders=await db.prepare('SELECT COUNT(*) AS count FROM survey_folders WHERE owner=? AND id IN (SELECT value FROM json_each(?))').bind(owner,ids).first<{count:number}>();
  if(!folders?.count)throw new ApiError('삭제할 폴더가 없습니다.',404);
  const photos=await db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes,COALESCE(SUM(CASE WHEN kind='drawing' THEN 1 ELSE 0 END),0) AS drawings FROM photos WHERE owner=? AND folder IN (SELECT value FROM json_each(?))").bind(owner,ids).first<{count:number;bytes:number;drawings:number}>();
  const sources=await db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes FROM schedule_imports s WHERE owner=? AND EXISTS (SELECT 1 FROM survey_folders f WHERE f.owner=s.owner AND f.region=s.region AND f.survey_date=s.survey_date AND f.id IN (SELECT value FROM json_each(?))) AND NOT EXISTS (SELECT 1 FROM survey_folders f WHERE f.owner=s.owner AND f.region=s.region AND f.survey_date=s.survey_date AND f.id NOT IN (SELECT value FROM json_each(?)))').bind(owner,ids,ids).first<{count:number;bytes:number}>();
  return json({folders:folders.count,photos:photos?.count||0,drawings:photos?.drawings||0,sources:sources?.count||0,bytes:(photos?.bytes||0)+(sources?.bytes||0)});
}catch(e){return failure(e);}}

export async function DELETE(request:Request){try{
  const owner=await identity(request);const {db,bucket}=storage();
  const params=new URL(request.url).searchParams,id=params.get('id'),region=params.get('region'),date=params.get('date');
  const bulk=params.get('batch')==='1';
  if(!bulk&&!id&&!region)throw new ApiError('삭제할 폴더를 선택해 주세요.');
  let where=id?'owner=? AND id=?':date?'owner=? AND region=? AND survey_date=?':'owner=? AND region=?';
  let values=id?[owner,id]:date?[owner,region!,date]:[owner,region!];
  // Lock the selected folders before collecting photos. The DB trigger rejects racing uploads.
  let continuation:{folderIds:string[];sourceIds:string[]}|null=null;
  if(bulk){
    let payload:unknown;try{payload=JSON.parse(new TextDecoder().decode(await limitedBody(request,2*1024*1024)));}catch{throw new ApiError('삭제 대상을 확인해 주세요.');}
    const initial=selectionSchema.safeParse(payload);
    if(initial.success){where='owner=? AND id IN (SELECT value FROM json_each(?))';values=[owner,JSON.stringify([...new Set(initial.data.ids)])];}
    else {const next=z.object({folderIds:z.array(z.string().min(1).max(150)).min(1).max(10000),sourceIds:z.array(z.string().max(150)).max(10000)}).strict().safeParse(payload);if(!next.success)throw new ApiError('삭제 진행 정보를 확인해 주세요.');continuation=next.data;}
  }else if(request.headers.get('content-type')?.split(';')[0].trim()==='application/json'){try{continuation=z.object({folderIds:z.array(z.string().max(150)).max(10000),sourceIds:z.array(z.string().max(150)).max(10000)}).parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,2*1024*1024))));}catch{throw new ApiError('삭제 진행 정보를 확인해 주세요.');}}
  const marked=continuation?null:await db.batch<{id:string;object_key:string}>([
    db.prepare(`UPDATE survey_folders SET deleting=1 WHERE ${where} RETURNING id`).bind(...values),
    db.prepare(`UPDATE photos SET deleted=1 WHERE owner=? AND folder IN (SELECT id FROM survey_folders WHERE ${where}) RETURNING id,object_key`).bind(owner,...values),
    bulk?db.prepare(`UPDATE schedule_imports SET deleted=1 WHERE owner=? AND (region,survey_date) IN (SELECT region,survey_date FROM survey_folders WHERE ${where}) AND NOT EXISTS (SELECT 1 FROM survey_folders f WHERE f.owner=schedule_imports.owner AND f.region=schedule_imports.region AND f.survey_date=schedule_imports.survey_date AND f.deleting=0) RETURNING id,object_key`).bind(owner,...values):id?db.prepare('UPDATE schedule_imports SET deleted=1 WHERE owner=? AND (region,survey_date) IN (SELECT region,survey_date FROM survey_folders WHERE owner=? AND id=?) AND NOT EXISTS (SELECT 1 FROM survey_folders f WHERE f.owner=schedule_imports.owner AND f.region=schedule_imports.region AND f.survey_date=schedule_imports.survey_date AND f.deleting=0) RETURNING id,object_key').bind(owner,owner,id):db.prepare(`UPDATE schedule_imports SET deleted=1 WHERE ${where} RETURNING id,object_key`).bind(...values),
  ]);
  const folderIds=continuation?.folderIds||marked![0].results.map(row=>row.id),sourceIds=continuation?.sourceIds||marked![2].results.map(row=>row.id);
  const ids=JSON.stringify(folderIds),sources=JSON.stringify(sourceIds);
  const photoRows=await db.prepare('SELECT id,object_key,thumbnail_key FROM photos WHERE owner=? AND deleted=1 AND folder IN (SELECT value FROM json_each(?)) LIMIT 10').bind(owner,ids).all<{id:string;object_key:string;thumbnail_key?:string|null}>();
  const sourceRows=await db.prepare('SELECT id,object_key FROM schedule_imports WHERE owner=? AND deleted=1 AND id IN (SELECT value FROM json_each(?)) LIMIT ?').bind(owner,sources,10-photoRows.results.length).all<{id:string;object_key:string;thumbnail_key?:string|null}>();
  for(const [table,rows] of [['photos',photoRows.results],['schedule_imports',sourceRows.results]] as const){
    for(const row of rows){if(row.thumbnail_key)await bucket.delete(row.thumbnail_key);await bucket.delete(row.object_key);await db.prepare(`DELETE FROM ${table} WHERE owner=? AND id=? AND deleted=1`).bind(owner,row.id).run();}
  }
  const pending=await db.prepare('SELECT (SELECT COUNT(*) FROM photos WHERE owner=? AND folder IN (SELECT value FROM json_each(?))) + (SELECT COUNT(*) FROM schedule_imports WHERE owner=? AND deleted=1 AND id IN (SELECT value FROM json_each(?))) AS count').bind(owner,ids,owner,sources).first<{count:number}>();
  if(pending?.count)return json({deleted:false,continuation:{folderIds,sourceIds},remaining:pending.count});
  await db.prepare('DELETE FROM survey_folders WHERE owner=? AND deleting=1 AND id IN (SELECT value FROM json_each(?))').bind(owner,ids).run();
  return json({deleted:true,folders:folderIds.length});
}catch(e){return failure(e);}}
