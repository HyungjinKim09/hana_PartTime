import {z} from 'zod';
import {identity,storage,json,failure,limitedBody,ApiError} from '@/lib/storage';
import {findFolder} from '@/lib/folders';
import {SURVEY_STATUSES} from '@/lib/daily-report';
const update=z.object({id:z.string().min(1).max(150),remarks:z.string().max(10000),buildingDetails:z.string().max(100),surveyStatus:z.enum(SURVEY_STATUSES)}).strict();
export async function PATCH(request:Request){try{
  const owner=await identity(request);const {db}=storage();
  let data;try{data=update.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,64000))));}catch{throw new ApiError('비고는 10,000자 이내로 입력하고 조사 상태를 확인해 주세요.');}
  if(!await findFolder(db,owner,data.id))throw new ApiError('폴더를 찾을 수 없습니다.',404);
  await db.prepare('UPDATE survey_folders SET remarks=?, building_details=?, survey_status=? WHERE owner=? AND id=?').bind(data.remarks,data.buildingDetails.trim(),data.surveyStatus,owner,data.id).run();
  return json({saved:true});
}catch(e){return failure(e);}}

export async function DELETE(request:Request){try{
  const owner=await identity(request);const {db,bucket}=storage();
  const params=new URL(request.url).searchParams,id=params.get('id'),region=params.get('region'),date=params.get('date');
  if(!id&&!region)throw new ApiError('삭제할 폴더를 선택해 주세요.');
  const where=id?'owner=? AND id=?':date?'owner=? AND region=? AND survey_date=?':'owner=? AND region=?';
  const values=id?[owner,id]:date?[owner,region!,date]:[owner,region!];
  // Lock the selected folders before collecting photos. The DB trigger rejects racing uploads.
  let continuation:{folderIds:string[];sourceIds:string[]}|null=null;
  if(request.headers.get('content-type')?.split(';')[0].trim()==='application/json'){try{continuation=z.object({folderIds:z.array(z.string().max(150)).max(10000),sourceIds:z.array(z.string().max(150)).max(10000)}).parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,2*1024*1024))));}catch{throw new ApiError('삭제 진행 정보를 확인해 주세요.');}}
  const marked=continuation?null:await db.batch<{id:string;object_key:string}>([
    db.prepare(`UPDATE survey_folders SET deleting=1 WHERE ${where} RETURNING id`).bind(...values),
    db.prepare(`UPDATE photos SET deleted=1 WHERE owner=? AND folder IN (SELECT id FROM survey_folders WHERE ${where}) RETURNING id,object_key`).bind(owner,...values),
    id?db.prepare('UPDATE schedule_imports SET deleted=1 WHERE owner=? AND (region,survey_date) IN (SELECT region,survey_date FROM survey_folders WHERE owner=? AND id=?) AND NOT EXISTS (SELECT 1 FROM survey_folders f WHERE f.owner=schedule_imports.owner AND f.region=schedule_imports.region AND f.survey_date=schedule_imports.survey_date AND f.deleting=0) RETURNING id,object_key').bind(owner,owner,id):db.prepare(`UPDATE schedule_imports SET deleted=1 WHERE ${where} RETURNING id,object_key`).bind(...values),
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
