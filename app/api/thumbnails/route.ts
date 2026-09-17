import {ApiError,failure,identity,storage,json,limitedBody,imageType} from '@/lib/storage';
export const dynamic='force-dynamic';
async function context(request:Request){
  const owner=await identity(request),{db,bucket}=storage(),id=new URL(request.url).searchParams.get('photo');
  const photo=await db.prepare('SELECT id,thumbnail_key FROM photos WHERE id=? AND owner=? AND deleted=0').bind(id||'',owner).first<{id:string;thumbnail_key:string|null}>();
  if(!photo)throw new ApiError('사진을 찾을 수 없습니다.',404);
  return {owner,db,bucket,photo};
}
export async function GET(request:Request){try{
  const {bucket,photo}=await context(request);if(!photo.thumbnail_key)throw new ApiError('미리보기가 없습니다.',404);
  const etag='"thumb-'+photo.id+'"',headers={'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
  const object=await bucket.get(photo.thumbnail_key);if(!object)throw new ApiError('미리보기를 찾을 수 없습니다.',404);
  return new Response(object.body,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(object.size)}});
}catch(e){return failure(e);}}
export async function PUT(request:Request){try{
  const {owner,db,bucket,photo}=await context(request);
  // Previews are immutable: retries do not reserve another write or overwrite one.
  if(photo.thumbnail_key)return json({saved:true});
  const bytes=await limitedBody(request,64*1024);if(imageType(bytes)!=='image/jpeg')throw new ApiError('JPG 미리보기만 지원합니다.',415);
  const key=`thumbnails/${owner}/${photo.id}/${crypto.randomUUID()}`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  let attached=false;
  try{
    const result=await db.prepare('UPDATE photos SET thumbnail_key=? WHERE id=? AND owner=? AND deleted=0 AND thumbnail_key IS NULL RETURNING id').bind(key,photo.id,owner).first();
    attached=!!result;if(!result){await bucket.delete(key);return json({saved:false});}
  }catch(e){if(!attached)await bucket.delete(key).catch(()=>{});throw e;}
  return json({saved:true});
}catch(e){return failure(e);}}
