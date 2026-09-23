import {z} from 'zod';
import {backupCatalogSchema,backupFolderSchema,backupPhotoSchema,backupSourceSchema,backupDrawingSchema,backupFileSchema,validateBackup,sha256} from './backup-format';
import {ApiError} from './storage';
export const recordSchemas={folder:backupFolderSchema,photo:backupPhotoSchema,source:backupSourceSchema,drawing:backupDrawingSchema,file:backupFileSchema};
export type RecordKind=keyof typeof recordSchemas;
export const restoreHeaderSchema=backupCatalogSchema.pick({format:true,version:true,backupId:true,createdAt:true}).extend({manifestHash:z.string().regex(/^[a-f0-9]{64}$/),folders:z.number().int().min(0).max(10000),photos:z.number().int().min(0).max(100000),sources:z.number().int().min(0).max(10000),drawings:z.number().int().min(0).max(10000)});
export type RestoreJob={id:string;status:string;prefix:string;manifest_hash:string;header:string;folders:number;photos:number;sources:number;drawings:number};
export async function restoreJob(db:D1Database,owner:string,id:string){const job=await db.prepare('SELECT * FROM restore_jobs WHERE owner=? AND id=?').bind(owner,id).first<RestoreJob>();if(!job)throw new ApiError('복원 작업을 찾을 수 없습니다.',404);return job;}
export async function restoreManifest(db:D1Database,owner:string,job:RestoreJob){
 const rows=await db.prepare('SELECT kind,payload FROM restore_records WHERE owner=? AND job=? ORDER BY position').bind(owner,job.id).all<{kind:RecordKind;payload:string}>();
 const values=(kind:RecordKind)=>rows.results.filter(r=>r.kind===kind).map(r=>JSON.parse(r.payload));
 const manifest=validateBackup({...JSON.parse(job.header),folders:values('folder'),photos:values('photo'),sources:values('source'),drawings:values('drawing'),files:values('file')});
 if(manifest.folders.length!==job.folders||manifest.photos.length!==job.photos||manifest.sources.length!==job.sources||manifest.drawings.length!==job.drawings||await sha256(new TextEncoder().encode(JSON.stringify(manifest)))!==job.manifest_hash)throw new ApiError('백업 목록이 덜 전송됐거나 변경됐습니다. 같은 백업으로 다시 시도해 주세요.',409);
 return manifest;
}
export async function publishRestore(db:D1Database,owner:string,job:RestoreJob){
 const manifest=await restoreManifest(db,owner,job);
 const objects=await db.prepare('SELECT kind,id,sha256,size FROM restore_objects WHERE owner=? AND job=?').bind(owner,job.id).all<{kind:string;id:string;sha256:string;size:number}>();
 const found=new Map(objects.results.map(o=>[o.kind+':'+o.id,o]));
 if(manifest.files.some(f=>found.get(f.kind+':'+f.id)?.sha256!==f.sha256||found.get(f.kind+':'+f.id)?.size!==f.size))throw new ApiError('복원할 원본 파일이 아직 모두 저장되지 않았습니다.',409);
 // Fixed-size SQL batch publishes the entire job atomically, even for large backups.
 const active="EXISTS(SELECT 1 FROM restore_jobs j WHERE j.owner=r.owner AND j.id=r.job AND j.status='open')";
 const val=(field:string)=>`json_extract(r.payload,'$.${field}')`;
 const results=await db.batch([
  db.prepare(`INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,unit_display,manual_added,time,name,phones,address,notes,remarks,building_details,survey_status,group_index,sort_index,warning,revision) SELECT r.owner,r.target_id,?||${val('region')},${['date','lot','unit','unitDisplay','manualAdded','time','name','phones','address','notes','remarks','buildingDetails','surveyStatus','group','sort','warning','revision'].map(val).join(',')} FROM restore_records r WHERE r.owner=? AND r.job=? AND r.kind='folder' AND ${active}`).bind(job.prefix,owner,job.id),
  db.prepare(`INSERT INTO photos(id,owner,folder,filename,object_key,content_type,size,created_at,kind) SELECT r.target_id,r.owner,f.target_id,${val('filename')},o.object_key,${val('content_type')},${val('size')},${val('created_at')},${val('kind')} FROM restore_records r JOIN restore_records f ON f.owner=r.owner AND f.job=r.job AND f.kind='folder' AND f.id=${val('folder')} JOIN restore_objects o ON o.owner=r.owner AND o.job=r.job AND o.kind='photo' AND o.id=r.id WHERE r.owner=? AND r.job=? AND r.kind='photo' AND ${active}`).bind(owner,job.id),
  db.prepare(`INSERT INTO schedule_imports(id,owner,filename,object_key,content_type,size,draft,region,survey_date,created_at) SELECT r.target_id,r.owner,${val('filename')},o.object_key,${val('content_type')},${val('size')},${val('draft')},?||${val('region')},${val('date')},${val('created_at')} FROM restore_records r JOIN restore_objects o ON o.owner=r.owner AND o.job=r.job AND o.kind='schedule' AND o.id=r.id WHERE r.owner=? AND r.job=? AND r.kind='source' AND ${active}`).bind(job.prefix,owner,job.id),
  db.prepare(`INSERT INTO drawing_drafts(photo_id,owner,draft,revision,updated_at) SELECT p.target_id,r.owner,${val('draft')},${val('revision')},${val('updated_at')} FROM restore_records r JOIN restore_records p ON p.owner=r.owner AND p.job=r.job AND p.kind='photo' AND p.id=r.id WHERE r.owner=? AND r.job=? AND r.kind='drawing' AND ${active}`).bind(owner,job.id),
  db.prepare("UPDATE restore_jobs SET status='complete' WHERE owner=? AND id=? AND status='open'").bind(owner,job.id),
 ]);
 if(!results.at(-1)?.meta.changes&&(await restoreJob(db,owner,job.id)).status!=='complete')throw new ApiError('복원이 취소되어 완료되지 않았습니다.',409);
}
