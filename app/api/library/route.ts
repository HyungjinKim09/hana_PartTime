import {listFolders,findFolder} from '@/lib/folders';
import {ApiError,failure,identity,json,storage,limitedBody,imageType} from '@/lib/storage';
import {safeFilename} from '@/lib/zip';
import {budgetUsage} from '@/lib/r2-budget';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  const owner=await identity();const {db}=storage();
  const folder=new URL(request.url).searchParams.get('folder');
  const [folders,photos,usage]=await Promise.all([
    listFolders(db,owner),
    folder?db.prepare('SELECT id,folder,filename,content_type,size,created_at,kind,thumbnail_key IS NOT NULL AS has_thumbnail FROM photos WHERE owner=? AND folder=? AND deleted=0 ORDER BY created_at DESC,id DESC').bind(owner,folder).all().then(r=>r.results):Promise.resolve([]),
    budgetUsage(db),
  ]);
  if(folder&&!folders.some(f=>f.id===folder))throw new ApiError('폴더를 찾을 수 없습니다.',404);
  return json({folders,photos,usage});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const owner=await identity(request);const {db,bucket}=storage();const url=new URL(request.url);
  const folder=url.searchParams.get('folder');
  const kind=url.searchParams.get('kind')||'photo';
  if(kind!=='photo'&&kind!=='drawing')throw new ApiError('사진 종류를 확인해 주세요.');
  if(!folder || !await findFolder(db,owner,folder)) throw new ApiError('사진을 넣을 번지 폴더를 선택해 주세요.');
  const filename=safeFilename(url.searchParams.get('filename')||'photo.jpg');
  const bytes=await limitedBody(request,20*1024*1024);const type=imageType(bytes);
  const id=crypto.randomUUID(),key=`photos/${owner}/${id}`,created=new Date().toISOString();
  await bucket.put(key,bytes,{httpMetadata:{contentType:type}});
  try { await db.prepare('INSERT INTO photos (id,owner,folder,filename,object_key,content_type,size,created_at,kind) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,owner,folder,filename,key,type,bytes.length,created,kind).run(); }
  catch(e){await bucket.delete(key).catch(()=>{});throw e;}
  return json({photo:{id,folder,kind,filename,content_type:type,size:bytes.length,created_at:created}},201);
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{
  const owner=await identity(request);const {db,bucket}=storage();const id=new URL(request.url).searchParams.get('id');
  const photo=await db.prepare('UPDATE photos SET deleted=1 WHERE id=? AND owner=? RETURNING object_key,thumbnail_key').bind(id||'',owner).first<{object_key:string;thumbnail_key:string|null}>();
  if(!photo) throw new ApiError('사진을 찾을 수 없습니다.',404);
  // Hide metadata durably first: a failed later cleanup cannot break the gallery or ZIP.
  // A retained tombstone allows the same DELETE request to safely retry cleanup.
  if(photo.thumbnail_key)await bucket.delete(photo.thumbnail_key);
  await bucket.delete(photo.object_key);
  await db.prepare('DELETE FROM photos WHERE id=? AND owner=?').bind(id,owner).run();
  return json({deleted:true});
}catch(e){return failure(e);}}
