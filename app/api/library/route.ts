import {matchingAddress} from '@/lib/address-folders';
import {listFolders,findFolder} from '@/lib/folders';
import {ApiError,failure,identity,json,storage,limitedBody,imageType} from '@/lib/storage';
import {safeFilename} from '@/lib/zip';
import {budgetUsage} from '@/lib/r2-budget';
import {claimUpload} from '@/lib/upload-receipt';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  const owner=await identity();const {db}=storage(),params=new URL(request.url).searchParams,folder=params.get('folder');
  const photosOnly=params.get('photosOnly')==='1',kind=params.get('kind');
  if(kind&&kind!=='photo'&&kind!=='drawing')throw new ApiError('사진 종류를 확인해 주세요.');
  const size=params.get('limit')||'60';if(!/^\d+$/.test(size)||Number(size)<1||Number(size)>100)throw new ApiError('사진 요청 범위를 확인해 주세요.');
  const limit=Number(size);let cursor:{created:string;id:string}|null=null;
  if(params.has('cursor')){try{const raw=params.get('cursor')!;if(raw.length>300)throw Error();const v=JSON.parse(raw);if(typeof v.created!=='string'||v.created.length>40||typeof v.id!=='string'||v.id.length>150)throw Error();cursor=v;}catch{throw new ApiError('사진 페이지 정보를 확인해 주세요.');}}
  let ids:string[]=[];
  if(folder){const target=await findFolder(db,owner,folder);if(!target)throw new ApiError('폴더를 찾을 수 없습니다.',404);
    ids=[folder];
    if(params.get('view')==='address'){
      const {folderView}=await import('@/lib/folders');
      const peers=await db.prepare('SELECT id,region,survey_date,lot,unit,unit_display,address FROM survey_folders WHERE owner=? AND region=? AND deleting=0').bind(owner,target.region).all();
      ids=matchingAddress(peers.results.map(row=>folderView({...target,...row})),folderView(target)).map(f=>f.id);
    }
  }
  let photos:Record<string,unknown>[]=[],nextCursor:string|null=null;
  if(ids.length){const values:unknown[]=[owner,JSON.stringify(ids)];let where='owner=? AND folder IN (SELECT value FROM json_each(?)) AND deleted=0';if(kind){where+=' AND kind=?';values.push(kind);}if(cursor){where+=' AND (created_at<? OR (created_at=? AND id<?))';values.push(cursor.created,cursor.created,cursor.id);}const rows=await db.prepare(`SELECT id,folder,filename,content_type,size,created_at,kind,thumbnail_key IS NOT NULL AS has_thumbnail FROM photos WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...values,limit+1).all();photos=rows.results.slice(0,limit);if(rows.results.length>limit){const last=photos[photos.length-1];nextCursor=JSON.stringify({created:last.created_at,id:last.id});}}
  if(photosOnly)return json({photos,nextCursor});
  const [folders,usage,recent]=await Promise.all([listFolders(db,owner),budgetUsage(db),db.prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM photos WHERE owner=? AND created_at>=? AND deleted=0').bind(owner,new Date(Date.now()-7*86400000).toISOString()).first<{bytes:number}>()]);
  return json({folders,photos,nextCursor,usage,forecast:{dailyBytes:(recent?.bytes||0)/7,daysRemaining:recent?.bytes?Math.max(0,(usage.storageLimit-usage.storageBytes)/(recent.bytes/7)):null}});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const started=performance.now(),timings:string[]=[];let checkpoint=started;
  const mark=(name:string)=>{const now=performance.now();timings.push(`${name};dur=${(now-checkpoint).toFixed(1)}`);checkpoint=now;};
  const owner=await identity(request);const {db,bucket}=storage();const url=new URL(request.url);
  mark('auth');
  const folder=url.searchParams.get('folder');
  const kind=url.searchParams.get('kind')||'photo';
  if(kind!=='photo'&&kind!=='drawing')throw new ApiError('사진 종류를 확인해 주세요.');
  if(!folder || !await findFolder(db,owner,folder)) throw new ApiError('사진을 넣을 번지 폴더를 선택해 주세요.');
  mark('folder');
  const filename=safeFilename(url.searchParams.get('filename')||'photo.jpg');
  const bytes=await limitedBody(request,20*1024*1024);const type=imageType(bytes);
  mark('body');
  const uploadId=request.headers.get('x-upload-id')||crypto.randomUUID();
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uploadId))throw new ApiError('업로드 작업 번호가 올바르지 않습니다.');
  const claimed=await claimUpload(db,owner,uploadId,folder,kind,filename,bytes);
  if(claimed.photo)return json({photo:claimed.photo},200);
  const {id,key,attempt}=claimed,created=new Date().toISOString();
  try {
    await bucket.put(key,bytes,{httpMetadata:{contentType:type}});mark('storage');
    const result=await db.batch([
      db.prepare("INSERT INTO photos (id,owner,folder,filename,object_key,content_type,size,created_at,kind) SELECT ?,?,?,?,?,?,?,?,? FROM upload_receipts WHERE owner=? AND id=? AND state='writing' AND attempt=? AND EXISTS(SELECT 1 FROM survey_folders WHERE owner=? AND id=? AND deleting=0)").bind(id,owner,folder,filename,key,type,bytes.length,created,kind,owner,uploadId,attempt,owner,folder),
      db.prepare("UPDATE upload_receipts SET state='saved' WHERE owner=? AND id=? AND attempt=? AND EXISTS(SELECT 1 FROM photos WHERE owner=? AND id=? AND object_key=?)").bind(owner,uploadId,attempt,owner,id,key),
    ]);
    if(!result[0].meta.changes)throw new ApiError('업로드 작업이 갱신됐습니다. 같은 사진으로 다시 시도해 주세요.',409);
    await db.prepare('DELETE FROM upload_attempts WHERE object_key=?').bind(key).run();
  }catch(e){
    // A DB response can fail after commit. Never remove a published original.
    const published=await db.prepare('SELECT id FROM photos WHERE owner=? AND object_key=?').bind(owner,key).first();
    if(!published){await bucket.delete(key).then(()=>db.prepare('DELETE FROM upload_attempts WHERE object_key=?').bind(key).run()).catch(()=>{});await db.prepare("UPDATE upload_receipts SET state='ready' WHERE owner=? AND id=? AND attempt=? AND state='writing'").bind(owner,uploadId,attempt).run();}
    throw e;
  }
  mark('metadata');
  const response=json({photo:{id,folder,kind,filename,content_type:type,size:bytes.length,created_at:created}},201);
  response.headers.set('Server-Timing',[...timings,`upload;dur=${(performance.now()-started).toFixed(1)}`].join(', '));
  return response;
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
