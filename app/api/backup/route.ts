import {ApiError,failure,identity,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {folderView,type FolderRow} from '@/lib/folders';
import {backupCatalogSchema} from '@/lib/backup-format';
export async function GET(){try{
 const owner=await identity(),{db}=storage();
 const rows=await db.batch<Record<string,unknown>>([
  db.prepare('SELECT id,folder,kind,filename,content_type,size,created_at FROM photos WHERE owner=? AND deleted=0 AND folder IN(SELECT id FROM survey_folders WHERE owner=? AND deleting=0)').bind(owner,owner),
  db.prepare('SELECT id,filename,content_type,size,draft,region,survey_date AS date,created_at FROM schedule_imports WHERE owner=? AND deleted=0').bind(owner),
  db.prepare("SELECT d.photo_id AS id,d.draft,d.revision,d.updated_at FROM drawing_drafts d JOIN photos p ON p.id=d.photo_id AND p.owner=d.owner JOIN survey_folders f ON f.owner=p.owner AND f.id=p.folder WHERE d.owner=? AND p.deleted=0 AND f.deleting=0").bind(owner),
  db.prepare('SELECT * FROM survey_folders WHERE owner=? AND deleting=0 ORDER BY region,survey_date,id').bind(owner),
 ]);
 const folders=rows[3].results as unknown as FolderRow[];
 return json(backupCatalogSchema.parse({format:'hana-backup',version:1,backupId:crypto.randomUUID(),createdAt:new Date().toISOString(),folders:folders.map(f=>({...folderView(f),address:f.address,sort:f.sort_index})),photos:rows[0].results,sources:rows[1].results,drawings:rows[2].results.map(d=>({...d,draft:JSON.parse(String(d.draft))}))}));
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
