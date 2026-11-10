import {attributed} from '@/lib/attribution';
import {ApiError,failure,identity,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {folderView,type FolderRow} from '@/lib/folders';
import {backupCatalogSchema} from '@/lib/backup-format';
export async function GET(){try{
 const owner=await identity(),{db}=storage();
 const rows=await db.batch<Record<string,unknown>>([
  db.prepare('SELECT id,folder,kind,filename,content_type,size,created_at,created_by FROM photos WHERE owner=? AND deleted=0 AND folder IN(SELECT id FROM survey_folders WHERE owner=? AND deleting=0)').bind(owner,owner),
  db.prepare('SELECT id,filename,content_type,size,draft,region,survey_date AS date,created_at,created_by FROM schedule_imports WHERE owner=? AND deleted=0').bind(owner),
  db.prepare("SELECT d.photo_id AS id,d.draft,d.revision,d.updated_at,d.updated_by FROM drawing_drafts d JOIN photos p ON p.id=d.photo_id AND p.owner=d.owner JOIN survey_folders f ON f.owner=p.owner AND f.id=p.folder WHERE d.owner=? AND p.deleted=0 AND f.deleting=0").bind(owner),
  db.prepare('SELECT f.*,COALESCE(p.photo_count,0) AS photo_count FROM survey_folders f LEFT JOIN folder_stats p ON p.owner=f.owner AND p.folder=f.id WHERE f.owner=? AND f.deleting=0 ORDER BY f.region,f.survey_date,f.id').bind(owner),
  db.prepare("SELECT json_array(r.folder_id,r.actor_id) AS id,r.folder_id AS folder,r.actor_id,r.actor_name,r.updated_at,r.remarks,r.building_details AS buildingDetails,r.survey_status AS surveyStatus,r.restored FROM personal_survey_records r JOIN survey_folders f ON f.owner=r.owner AND f.id=r.folder_id WHERE r.owner=? AND f.deleting=0 ORDER BY r.folder_id,r.actor_id").bind(owner),
 ]);
 const folders=rows[3].results as unknown as FolderRow[];
 return json(backupCatalogSchema.parse({format:'hana-backup',version:1,backupId:crypto.randomUUID(),createdAt:new Date().toISOString(),folders:folders.map(f=>({...folderView(f),address:f.address,sort:f.sort_index})),photos:rows[0].results.map(attributed),sources:rows[1].results.map(attributed),drawings:rows[2].results.map(d=>({...attributed(d),draft:JSON.parse(String(d.draft))})),personalSurveys:rows[4].results.map(r=>({...r,actor:{id:r.actor_id,name:r.actor_name,at:r.updated_at,...(r.restored?{restored:true}:{})}}))}));
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 requireSameOrigin(request);const owner=await identity(request),{db,bucket}=storage();
 const data=JSON.parse(new TextDecoder().decode(await limitedBody(request,2000))) as {kind?:string;id?:string};
 if(!['photo','schedule'].includes(data.kind||'')||typeof data.id!=='string'||data.id.length>150)throw new ApiError('백업 원본을 확인해 주세요.');
 const table=data.kind==='photo'?'photos':'schedule_imports';
 const object=await db.prepare(`SELECT object_key FROM ${table} WHERE owner=? AND id=? AND deleted=0`).bind(owner,data.id).first<{object_key:string}>();
 if(!object)throw new ApiError('백업 중 원본이 변경되거나 삭제됐습니다. 새 백업을 시작해 주세요.',404);
 const [ticket]=await bucket.issueDownloads(owner,[object.object_key]);return json({url:'/api/export/'+ticket});
}catch(e){return failure(e);}}
