import {attribution} from './attribution';
import {ApiError,type storage} from './storage';
import type {SessionUser} from './session-lookup';

type PhotoObject={id:string;object_key:string;thumbnail_key:string|null};
type PhotoStorage=ReturnType<typeof storage>;
const previewLifetime=60*60*1000;

export async function removePhotoObject({db,bucket}:PhotoStorage,owner:string,photo:PhotoObject){
 if(photo.thumbnail_key)await bucket.delete(photo.thumbnail_key);
 await bucket.delete(photo.object_key);
 await db.prepare('DELETE FROM photos WHERE owner=? AND id=? AND deleted=1').bind(owner,photo.id).run();
}

export async function previewPhotoDeletion(db:D1Database,user:SessionUser,selected:string[]){
 const {owner,memberId}=user;
 const preview=await db.prepare(`SELECT json_group_array(json_object('id',f.id,'revision',f.photo_revision)) AS folders,
   COALESCE(SUM(s.photo_count),0) AS photos,COALESCE(SUM(s.photo_bytes),0) AS bytes
  FROM json_each(?) chosen CROSS JOIN survey_folders f
  LEFT JOIN folder_stats s ON s.owner=f.owner AND s.folder=f.id
  WHERE f.owner=? AND f.id=chosen.value AND f.deleting=0`).bind(JSON.stringify(selected),owner).first<{folders:string;photos:number;bytes:number}>();
 const folders=JSON.parse(preview?.folders||'[]') as {id:string;revision:number}[];
 if(!folders.length)throw new ApiError('삭제할 사진이 있는 폴더를 선택해 주세요.',404);
 const batchId=crypto.randomUUID(),now=Date.now();
 await db.batch([
  db.prepare(`DELETE FROM photo_delete_jobs WHERE owner=? AND id IN (
   SELECT j.id FROM photo_delete_jobs j WHERE j.owner=? AND j.created_at<?
   AND NOT EXISTS(SELECT 1 FROM photos p WHERE p.owner=j.owner AND p.delete_batch=j.id) LIMIT 100)`)
   .bind(owner,owner,now-previewLifetime),
  db.prepare('INSERT INTO photo_delete_jobs (owner,id,actor,folders,created_at) VALUES (?,?,?,?,?)').bind(owner,batchId,memberId||'admin',preview!.folders,now),
 ]);
 return {batchId,ids:folders.map(folder=>folder.id),folders:folders.length,photos:preview!.photos,bytes:preview!.bytes,drawings:0,sources:0};
}

export async function deletePhotoBatch(storage:PhotoStorage,user:SessionUser,batchId:string){
 const {db}=storage,{owner,memberId}=user,actor=memberId||'admin';
 const attempt=crypto.randomUUID();
 // Compare folder photo revisions and hide exactly the reviewed set in one transaction.
 const results=await db.batch<{started_by:string|null}>([
  db.prepare(`UPDATE photo_delete_jobs SET started_by=?
   WHERE owner=? AND id=? AND actor=? AND started_by IS NULL AND created_at>=?
   AND NOT EXISTS(SELECT 1 FROM json_each(photo_delete_jobs.folders) expected
    LEFT JOIN survey_folders f ON f.owner=photo_delete_jobs.owner AND f.id=json_extract(expected.value,'$.id')
    WHERE f.id IS NULL OR f.deleting<>0 OR f.photo_revision<>json_extract(expected.value,'$.revision'))`)
   .bind(attempt,owner,batchId,actor,Date.now()-previewLifetime),
  db.prepare(`UPDATE photos SET deleted=1,deleted_by=?,delete_batch=? WHERE owner=? AND kind='photo' AND deleted=0 AND folder IN (
    SELECT json_extract(chosen.value,'$.id') FROM photo_delete_jobs j CROSS JOIN json_each(j.folders) chosen
    WHERE j.owner=? AND j.id=? AND j.started_by=?)`).bind(attribution(user),batchId,owner,owner,batchId,attempt),
  db.prepare('SELECT started_by FROM photo_delete_jobs WHERE owner=? AND id=? AND actor=?').bind(owner,batchId,actor),
 ]);
 const job=results[2].results[0];
 if(!job)throw new ApiError('사진 삭제 작업을 찾을 수 없습니다. 대상을 다시 확인해 주세요.',404);
 if(!job.started_by)throw new ApiError('폴더의 사진이 변경됐거나 확인 시간이 지났습니다. 삭제 대상을 다시 확인해 주세요.',409);

 const next=await db.prepare('SELECT id,object_key,thumbnail_key FROM photos WHERE owner=? AND delete_batch=? AND deleted=1 LIMIT 10').bind(owner,batchId).all<PhotoObject>();
 for(const photo of next.results)await removePhotoObject(storage,owner,photo);
 const pending=await db.prepare('SELECT COUNT(*) AS count FROM photos WHERE owner=? AND delete_batch=? AND deleted=1').bind(owner,batchId).first<{count:number}>();
 const remaining=pending?.count||0;
 return {deleted:remaining===0,remaining};
}

export async function cleanInterruptedPhotoDeletes(storage:PhotoStorage,owner:string,before:number){
 const rows=await storage.db.prepare(`SELECT p.id,p.object_key,p.thumbnail_key FROM photos p
  JOIN photo_delete_jobs j ON j.owner=p.owner AND j.id=p.delete_batch
  WHERE p.owner=? AND p.deleted=1 AND j.created_at<? LIMIT 5`).bind(owner,before).all<PhotoObject>();
 for(const photo of rows.results)await removePhotoObject(storage,owner,photo);
 return rows.results.length===5;
}
