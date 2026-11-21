import {attributed,attribution} from '@/lib/attribution';
import {ApiError,failure,identity,identityUser,imageType,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {photoVersionTag} from '@/lib/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
const previewLimit=64*1024,previewDimensionLimit=640;

function jpegDimensions(bytes:Uint8Array){
 if(bytes[0]!==0xff||bytes[1]!==0xd8)return null;
 const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
 let offset=2;
 while(offset+4<=bytes.length){
  if(bytes[offset++]!==0xff)return null;
  while(offset<bytes.length&&bytes[offset]===0xff)offset++;
  const marker=bytes[offset++];
  if(marker===0xda||marker===0xd9)return null;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(offset+2>bytes.length)return null;
  const length=(bytes[offset]<<8)|bytes[offset+1];
  if(length<2||offset+length>bytes.length)return null;
  if(sof.has(marker)){
   if(length<8)return null;
   return {height:(bytes[offset+3]<<8)|bytes[offset+4],width:(bytes[offset+5]<<8)|bytes[offset+6]};
  }
  offset+=length;
 }
 return null;
}

async function previewBody(request:Request){
 const declared=Number(request.headers.get('content-length')||0);
 if(declared>previewLimit)throw new ApiError('미리보기 사진은 64KB 이하여야 합니다.',413);
 if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='image/jpeg')throw new ApiError('미리보기는 JPEG 파일이어야 합니다.',415);
 if(!request.body)throw new ApiError('미리보기 사진이 없습니다.');
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   size+=value.length;
   if(size>previewLimit){await reader.cancel();throw new ApiError('미리보기 사진은 64KB 이하여야 합니다.',413);}
   parts.push(value);
  }
 }finally{reader.releaseLock();}
 if(!size)throw new ApiError('미리보기 사진이 없습니다.');
 const bytes=new Uint8Array(size);let offset=0;
 for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 if(imageType(bytes)!=='image/jpeg')throw new ApiError('미리보기는 JPEG 파일이어야 합니다.',415);
 const dimensions=jpegDimensions(bytes);
 if(!dimensions||dimensions.width<1||dimensions.height<1)throw new ApiError('JPEG 미리보기 크기를 확인할 수 없습니다.',415);
 if(Math.max(dimensions.width,dimensions.height)>previewDimensionLimit)throw new ApiError('미리보기는 긴 변이 640픽셀 이하여야 합니다.',413);
 return bytes;
}

function previewTag(id:string,version:string){return `${photoVersionTag(id,version).slice(0,-1)}-thumbnail"`;}

export async function GET(request:Request,{params}:Context){try{
  const owner=await identity();const {db,bucket}=storage();const {id}=await params;
  const row=await db.prepare('SELECT object_key,thumbnail_key,content_type,filename,version FROM photos WHERE id=? AND owner=? AND deleted=0').bind(id,owner).first<{object_key:string;thumbnail_key:string|null;content_type:string;filename:string;version:string}>();
  if(!row) throw new ApiError('사진을 찾을 수 없습니다.',404);
  const query=new URL(request.url).searchParams,download=query.has('download');
  const wantPreview=!download&&query.get('preview')==='1'&&Boolean(row.thumbnail_key);
  let isPreview=wantPreview,etag=isPreview?previewTag(id,row.version):photoVersionTag(id,row.version);
  if(!download&&request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Cookie','X-Hana-Preview':isPreview?'thumbnail':'original'}});
  let object=await bucket.get(isPreview?row.thumbnail_key!:row.object_key);
  if(!object&&isPreview){isPreview=false;etag=photoVersionTag(id,row.version);object=await bucket.get(row.object_key);}
  if(!object)throw new ApiError(isPreview?'사진 미리보기를 불러올 수 없습니다.':'원본 사진을 불러올 수 없습니다.',404);
  if(!download&&request.headers.get('if-none-match')===etag){await object.body.cancel().catch(()=>{});return new Response(null,{status:304,headers:{'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Cookie','X-Hana-Preview':isPreview?'thumbnail':'original'}});}
  return new Response(object.body,{headers:{'Content-Type':isPreview?'image/jpeg':row.content_type,'Content-Length':String(object.size),'Cache-Control':download?'private, no-store':'private, no-cache','ETag':etag,'Vary':'Cookie','X-Hana-Preview':isPreview?'thumbnail':'original','X-Content-Type-Options':'nosniff','Content-Disposition':`${download?'attachment':'inline'}; filename="photo"; filename*=UTF-8''${encodeURIComponent(row.filename)}`}});
}catch(e){return failure(e);}}

export async function PUT(request:Request,{params}:Context){try{
 const user=await identityUser(request),{owner}=user;requireSameOrigin(request);
 const {db,bucket}=storage(),{id}=await params,expected=request.headers.get('if-match');
 if(!expected)throw new ApiError('사진을 다시 열고 미리보기를 저장해 주세요.',428);
 const current=await db.prepare(`SELECT p.version,p.thumbnail_key,p.kind,p.deleted
  FROM photos p JOIN survey_folders f ON f.owner=p.owner AND f.id=p.folder AND f.deleting=0
  WHERE p.id=? AND p.owner=? AND p.deleted=0`).bind(id,owner).first<{version:string;thumbnail_key:string|null;kind:string;deleted:number}>();
 if(!current)throw new ApiError('사진을 찾을 수 없습니다.',404);
 const conflict=()=>new ApiError('사진이 변경됐거나 삭제됐습니다. 다시 불러와 주세요.',412);
 if(expected!==photoVersionTag(id,current.version))throw conflict();
 if(current.kind!=='photo')throw new ApiError('도면에는 사진 미리보기를 저장할 수 없습니다.',415);
 const bytes=await previewBody(request);
 if(current.thumbnail_key)return json({saved:true,alreadyExists:true});

 const attempt=crypto.randomUUID(),key=`thumbnails/${owner}/${id}/${attempt}`,started=Date.now();
 await db.prepare('INSERT INTO upload_attempts (object_key,owner,upload_id,started_at) VALUES (?,?,?,?)').bind(key,owner,attempt,started).run();
 const clean=async()=>{
  await bucket.delete(key);
  await db.prepare('DELETE FROM upload_attempts WHERE object_key=? AND owner=?').bind(key,owner).run();
 };
 try{
  await bucket.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  const results=await db.batch([
   db.prepare(`UPDATE photos SET thumbnail_key=? WHERE owner=? AND id=? AND version=? AND deleted=0 AND thumbnail_key IS NULL
    AND EXISTS(SELECT 1 FROM survey_folders f WHERE f.owner=photos.owner AND f.id=photos.folder AND f.deleting=0)
    AND EXISTS(SELECT 1 FROM upload_attempts WHERE object_key=? AND owner=? AND upload_id=? AND started_at=?)
    RETURNING id`)
    .bind(key,owner,id,current.version,key,owner,attempt,started),
   // A losing writer still needs this marker if R2 cleanup is unavailable.
   db.prepare('DELETE FROM upload_attempts WHERE object_key=? AND owner=? AND EXISTS(SELECT 1 FROM photos WHERE owner=? AND id=? AND thumbnail_key=?)')
    .bind(key,owner,owner,id,key),
  ]);
  if(results[0].results.length)return json({saved:true});
  const latest=await db.prepare('SELECT version,thumbnail_key,deleted FROM photos WHERE owner=? AND id=?').bind(owner,id).first<{version:string;thumbnail_key:string|null;deleted:number}>();
  await clean();
  if(latest&&latest.deleted===0&&latest.version===current.version&&latest.thumbnail_key)return json({saved:true,alreadyExists:true});
  throw conflict();
 }catch(error){
  const attached=await db.prepare('SELECT thumbnail_key FROM photos WHERE owner=? AND id=?').bind(owner,id).first<{thumbnail_key:string|null}>().catch(()=>undefined);
  if(attached?.thumbnail_key===key){
   await db.prepare('DELETE FROM upload_attempts WHERE object_key=? AND owner=?').bind(key,owner).run().catch(()=>{});
   return json({saved:true});
  }
  if(attached!==undefined)await clean().catch(()=>{});
  throw error;
 }
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
    WHERE owner=? AND id=? AND version=? AND thumbnail_key IS ? AND deleted=0
      AND EXISTS(SELECT 1 FROM survey_folders f WHERE f.owner=photos.owner AND f.id=photos.folder AND f.deleting=0)
      AND EXISTS(SELECT 1 FROM upload_attempts WHERE object_key=? AND owner=? AND started_at>=?)
    RETURNING id,folder,kind,filename,size,content_type,created_at,created_by,restored,version`)
    .bind(key,bytes.length,type,filename,version,owner,id,current.version,current.thumbnail_key,key,owner,Date.now()-600000),
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
