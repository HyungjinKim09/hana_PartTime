import {attributed,attribution} from '@/lib/attribution';
import {ApiError,failure,identity,identityUser,imageType,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {photoVersionTag} from '@/lib/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{
  const owner=await identity();const {db,bucket}=storage();const {id}=await params;
  const row=await db.prepare('SELECT object_key,content_type,filename,version FROM photos WHERE id=? AND owner=? AND deleted=0').bind(id,owner).first<{object_key:string;content_type:string;filename:string;version:string}>();
  if(!row) throw new ApiError('사진을 찾을 수 없습니다.',404);
  const download=new URL(request.url).searchParams.has('download');
  const etag=photoVersionTag(id,row.version);
  if(!download&&request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Cookie'}});
  const object=await bucket.get(row.object_key); if(!object) throw new ApiError('원본 사진을 불러올 수 없습니다.',404);
  return new Response(object.body,{headers:{'Content-Type':row.content_type,'Content-Length':String(object.size),'Cache-Control':download?'private, no-store':'private, no-cache','ETag':etag,'Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Disposition':`${download?'attachment':'inline'}; filename="photo"; filename*=UTF-8''${encodeURIComponent(row.filename)}`}});
}catch(e){return failure(e);}}

export async function PATCH(request:Request,{params}:Context){try{
 const user=await identityUser(request),{owner}=user;
 requireSameOrigin(request);
 const {db,bucket}=storage(),{id}=await params;
 const expected=request.headers.get('if-match');
 if(!expected)throw new ApiError('사진을 다시 열고 회전해 주세요.',428);
 const current=await db.prepare(`SELECT p.object_key,p.thumbnail_key,p.version,p.content_type,p.filename,p.kind FROM photos p
   JOIN survey_folders f ON f.owner=p.owner AND f.id=p.folder AND f.deleting=0
   WHERE p.id=? AND p.owner=? AND p.deleted=0`).bind(id,owner).first<{object_key:string;thumbnail_key:string|null;version:string;content_type:string;filename:string;kind:string}>();
 if(!current)throw new ApiError('사진을 찾을 수 없습니다.',404);
 const conflict=()=>new ApiError('다른 기기에서 사진이 변경됐습니다. 사진을 다시 열어 확인해 주세요.',412);
 if(expected!==photoVersionTag(id,current.version))throw conflict();
 if(current.kind!=='photo'||!['image/jpeg','image/png','image/webp','image/heic'].includes(current.content_type))throw new ApiError('이 형식의 사진은 회전 저장을 지원하지 않습니다.',415);
 const bytes=await limitedBody(request,20*1024*1024),type=imageType(bytes);
 const targetType=current.content_type==='image/heic'?'image/jpeg':current.content_type;
 if(type!==targetType)throw new ApiError('회전한 사진의 파일 형식이 맞지 않습니다.',415);
 const filename=type===current.content_type?current.filename:current.filename.replace(/\.[^.]+$/,'').slice(0,196)+'.jpg';
 const version=crypto.randomUUID(),key=`photos/${owner}/${id}/${version}`,stamp=attribution(user);
 const oldKeys=[...new Set([current.object_key,...(current.thumbnail_key?[current.thumbnail_key]:[])])];
 await db.prepare('INSERT INTO upload_attempts (object_key,owner,upload_id,started_at) VALUES (?,?,?,?)').bind(key,owner,version,Date.now()).run();
 const clean=async(objectKey:string)=>{
  await bucket.delete(objectKey);
  await db.prepare('DELETE FROM upload_attempts WHERE object_key=? AND owner=?').bind(objectKey,owner).run();
 };
 let updated:Record<string,unknown>|undefined;
 try{
  await bucket.put(key,bytes,{httpMetadata:{contentType:type}});
  const result=await db.batch<Record<string,unknown>>([
   db.prepare(`UPDATE photos SET object_key=?,thumbnail_key=NULL,size=?,content_type=?,filename=?,version=?
    WHERE owner=? AND id=? AND version=? AND deleted=0
      AND EXISTS(SELECT 1 FROM survey_folders f WHERE f.owner=photos.owner AND f.id=photos.folder AND f.deleting=0)
      AND EXISTS(SELECT 1 FROM upload_attempts WHERE object_key=? AND owner=? AND started_at>=?)
    RETURNING id,folder,kind,filename,size,content_type,created_at,created_by,restored,version`)
    .bind(key,bytes.length,type,filename,version,owner,id,current.version,key,owner,Date.now()-600000),
   db.prepare(`INSERT OR IGNORE INTO upload_attempts (object_key,owner,upload_id,started_at)
    SELECT value,?,?,? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM photos WHERE id=? AND owner=? AND object_key=?)`)
    .bind(owner,version,Date.now(),JSON.stringify(oldKeys),id,owner,key),
   db.prepare(`INSERT INTO activity_log (owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at)
    SELECT owner,?,json_extract(?,'$.id'),json_extract(?,'$.name'),'photo.rotated',kind,id,folder,filename,'complete',json_extract(?,'$.at')
    FROM photos WHERE id=? AND owner=? AND object_key=?`).bind('photo:rotate:'+version,stamp,stamp,stamp,id,owner,key),
   db.prepare('DELETE FROM upload_attempts WHERE object_key=? AND owner=? AND EXISTS(SELECT 1 FROM photos WHERE id=? AND owner=? AND object_key=?)').bind(key,owner,id,owner,key),
  ]);
  updated=result[0].results[0];
  if(!updated)throw conflict();
 }catch(error){
  // A failed response can follow a committed batch. Leave uncertain objects for maintenance.
  const state=await db.prepare('SELECT id,folder,kind,filename,size,content_type,created_at,created_by,restored,version FROM photos WHERE owner=? AND object_key=? AND deleted=0').bind(owner,key).first<Record<string,unknown>>().catch(()=>undefined);
  if(!state){if(state===null)await clean(key).catch(()=>{});throw error;}
  updated=state;
 }
 await Promise.allSettled(oldKeys.map(clean));
 return json({photo:attributed(updated)});
}catch(e){return failure(e);}}
