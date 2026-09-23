import {ApiError,failure,identity,json,limitedBody,requireSameOrigin,storage,imageType} from '@/lib/storage';
import {recordSchemas,restoreHeaderSchema,restoreJob,publishRestore,type RecordKind} from '@/lib/restore';
import {sha256} from '@/lib/backup-format';
import {claimUpload} from '@/lib/upload-receipt';
const jobId=(request:Request)=>new URL(request.url).searchParams.get('job')||'';
export async function GET(request:Request){try{
 const owner=await identity(),{db}=storage(),id=jobId(request);
 if(!id)return json({jobs:(await db.prepare("SELECT id,prefix,status,created_at FROM restore_jobs WHERE owner=? AND status!='complete' ORDER BY created_at DESC").bind(owner).all()).results});
 const job=await restoreJob(db,owner,id);
 const saved=await db.prepare('SELECT kind,id FROM restore_objects WHERE owner=? AND job=?').bind(owner,id).all();
 return json({status:job.status,prefix:job.prefix,saved:saved.results});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 requireSameOrigin(request);const owner=await identity(request),{db}=storage();
 const input=JSON.parse(new TextDecoder().decode(await limitedBody(request,1500000)));
 if(input.action==='start'){
  const header=restoreHeaderSchema.parse(input.header),id=header.backupId;
  const catalog={format:header.format,version:header.version,backupId:id,createdAt:header.createdAt};
  await db.prepare("INSERT INTO restore_jobs(owner,id,manifest_hash,prefix,status,header,folders,photos,sources,drawings,created_at) VALUES(?,?,?,?,'open',?,?,?,?,?,?) ON CONFLICT DO NOTHING").bind(owner,id,header.manifestHash,`복원 ${new Date().toISOString().slice(0,5)}-${id.slice(0,8)} · `,JSON.stringify(catalog),header.folders,header.photos,header.sources,header.drawings,new Date().toISOString()).run();
  const job=await restoreJob(db,owner,id);if(job.manifest_hash!==header.manifestHash||job.folders!==header.folders||job.photos!==header.photos||job.sources!==header.sources||job.drawings!==header.drawings)throw new ApiError('다른 내용의 복원 작업이 이미 있습니다.',409);
  return json({id,status:job.status,prefix:job.prefix});
 }
 const job=await restoreJob(db,owner,String(input.job||''));
 if(job.status==='complete')return json({status:'complete',prefix:job.prefix});
 if(job.status!=='open')throw new ApiError('취소 중인 복원 작업입니다.',409);
 if(input.action==='finish'){await publishRestore(db,owner,job);return json({status:'complete',prefix:job.prefix});}
 if(input.action!=='records'||!Array.isArray(input.records)||input.records.length>20)throw new ApiError('복원 목록을 확인해 주세요.');
 const limits={folder:job.folders,photo:job.photos,source:job.sources,drawing:job.drawings,file:job.photos+job.sources};
 for(const record of input.records){
  const kind=record.kind as RecordKind;if(!Object.hasOwn(recordSchemas,kind)||!Number.isInteger(record.position)||record.position<0||record.position>=limits[kind])throw new ApiError('복원 목록의 순서가 맞지 않습니다.');
  const value=recordSchemas[kind].parse(record.value),id=kind==='file'?`${(value as {kind:string}).kind}:${value.id}`:value.id,payload=JSON.stringify(value);
  await db.prepare("INSERT INTO restore_records(owner,job,kind,id,target_id,position,payload) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM restore_jobs WHERE owner=? AND id=? AND status='open') ON CONFLICT DO NOTHING").bind(owner,job.id,kind,id,crypto.randomUUID(),record.position,payload,owner,job.id).run();
  const existing=await db.prepare('SELECT payload,position FROM restore_records WHERE owner=? AND job=? AND kind=? AND id=?').bind(owner,job.id,kind,id).first<{payload:string;position:number}>();
  if(existing?.payload!==payload||existing?.position!==record.position)throw new ApiError('다른 내용의 복원 목록이 이미 있습니다.',409);
 }
 return json({status:'open'});
}catch(e){return failure(e);}}
export async function PUT(request:Request){try{
 requireSameOrigin(request);const owner=await identity(request),{db,bucket}=storage(),params=new URL(request.url).searchParams,job=await restoreJob(db,owner,jobId(request));
 if(job.status!=='open')throw new ApiError('진행 중인 복원 작업만 파일을 추가할 수 있습니다.',409);
 const kind=params.get('kind'),id=params.get('id')||'';if(kind!=='photo'&&kind!=='schedule')throw new ApiError('원본 종류를 확인해 주세요.');
 const records=await db.prepare('SELECT kind,payload FROM restore_records WHERE owner=? AND job=? AND ((kind=? AND id=?) OR (kind=\'file\' AND id=?))').bind(owner,job.id,kind==='photo'?'photo':'source',id,kind+':'+id).all<{kind:string;payload:string}>();
 const metadata=records.results.find(r=>r.kind!=='file'),file=records.results.find(r=>r.kind==='file');if(!metadata||!file)throw new ApiError('원본 목록을 먼저 전송해 주세요.',409);
 const expected=JSON.parse(file.payload),info=JSON.parse(metadata.payload),bytes=await limitedBody(request,20*1024*1024),type=imageType(bytes);
 if(expected.size!==bytes.length||info.size!==bytes.length||info.content_type!==type||expected.sha256!==await sha256(bytes))throw new ApiError('백업 원본의 크기 또는 해시가 일치하지 않습니다.',422);
 const operation=`restore:${job.id}:${kind}:${id}`,lookup=()=>db.prepare('SELECT id FROM restore_objects WHERE owner=? AND job=? AND kind=? AND id=?').bind(owner,job.id,kind,id).first();
 const claimed=await claimUpload(db,owner,operation,`restore:${job.id}`,kind,info.filename,bytes,lookup);if(claimed.photo)return json({saved:true});
 const {key,attempt}=claimed;
 try{
  await bucket.put(key,bytes,{httpMetadata:{contentType:type}});
  const results=await db.batch([
   db.prepare("INSERT INTO restore_objects(owner,job,kind,id,object_key,sha256,size,content_type) SELECT ?,?,?,?,?,?,?,? FROM upload_receipts u WHERE u.owner=? AND u.id=? AND u.state='writing' AND u.attempt=? AND EXISTS(SELECT 1 FROM restore_jobs WHERE owner=? AND id=? AND status='open')").bind(owner,job.id,kind,id,key,expected.sha256,bytes.length,type,owner,operation,attempt,owner,job.id),
   db.prepare("UPDATE upload_receipts SET state='saved' WHERE owner=? AND id=? AND attempt=? AND EXISTS(SELECT 1 FROM restore_objects WHERE owner=? AND object_key=?)").bind(owner,operation,attempt,owner,key),
  ]);
  if(!results[0].meta.changes)throw new ApiError('복원 작업 상태가 변경됐습니다.',409);
  await db.prepare('DELETE FROM upload_attempts WHERE object_key=?').bind(key).run();
 }catch(e){if(!await db.prepare('SELECT id FROM restore_objects WHERE owner=? AND object_key=?').bind(owner,key).first()){await bucket.delete(key).then(()=>db.prepare('DELETE FROM upload_attempts WHERE object_key=?').bind(key).run()).catch(()=>{});await db.prepare("UPDATE upload_receipts SET state='ready' WHERE owner=? AND id=? AND attempt=? AND state='writing'").bind(owner,operation,attempt).run();}throw e;}
 return json({saved:true},201);
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{
 requireSameOrigin(request);const owner=await identity(request),{db,bucket}=storage(),id=jobId(request),job=await restoreJob(db,owner,id);
 if(job.status==='complete')throw new ApiError('완료된 복원은 폴더 관리에서 삭제해 주세요.',409);
 const cancelled=await db.prepare("UPDATE restore_jobs SET status='cancelling' WHERE owner=? AND id=? AND status IN('open','cancelling') RETURNING id").bind(owner,id).first();
 if(!cancelled)throw new ApiError('완료된 복원은 폴더 관리에서 삭제해 주세요.',409);
 const objects=await db.prepare('SELECT object_key FROM restore_objects WHERE owner=? AND job=? LIMIT 5').bind(owner,id).all<{object_key:string}>();
 for(const object of objects.results){await bucket.delete(object.object_key);await db.prepare('DELETE FROM restore_objects WHERE owner=? AND job=? AND object_key=?').bind(owner,id,object.object_key).run();}
 const remaining=await db.prepare('SELECT COUNT(*) AS n FROM restore_objects WHERE owner=? AND job=?').bind(owner,id).first<{n:number}>();
 // In-flight writers are fenced; their catch path removes their unpublished objects.
 const pending=await db.prepare('SELECT object_key,started_at FROM upload_attempts WHERE owner=? AND upload_id IN(SELECT id FROM upload_receipts WHERE owner=? AND folder=?)').bind(owner,owner,`restore:${id}`).all<{object_key:string;started_at:number}>();
 for(const item of pending.results.filter(p=>p.started_at<Date.now()-600000).slice(0,5)){await bucket.delete(item.object_key);await db.prepare('DELETE FROM upload_attempts WHERE object_key=?').bind(item.object_key).run();}
 if(remaining?.n||pending.results.length)return json({done:false,wait:pending.results.some(p=>p.started_at>=Date.now()-600000),message:'임시 파일 정리 중입니다. 전송 중이던 요청은 잠시 후 다시 정리할 수 있습니다.'});
 await db.batch([db.prepare('DELETE FROM restore_records WHERE owner=? AND job=?').bind(owner,id),db.prepare('DELETE FROM upload_receipts WHERE owner=? AND folder=?').bind(owner,`restore:${id}`),db.prepare('DELETE FROM restore_jobs WHERE owner=? AND id=?').bind(owner,id)]);
 return json({done:true});
}catch(e){return failure(e);}}
