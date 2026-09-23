import {ApiError} from './storage';
type Receipt={folder:string;kind:string;filename:string;fingerprint:string;photo_id:string;state:string;attempt:string;started_at:number};
export async function claimUpload(db:D1Database,owner:string,id:string,folder:string,kind:string,filename:string,bytes:Uint8Array<ArrayBuffer>,saved?:()=>Promise<Record<string,unknown>|null>){
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const attempt=crypto.randomUUID(),now=Date.now(),photoId=crypto.randomUUID();
 await db.prepare("INSERT INTO upload_receipts(owner,id,folder,kind,filename,fingerprint,photo_id,state,attempt,started_at) VALUES(?,?,?,?,?,?,?,'ready',?,?) ON CONFLICT DO NOTHING").bind(owner,id,folder,kind,filename,fingerprint,photoId,attempt,now).run();
 const receipt=await db.prepare('SELECT * FROM upload_receipts WHERE owner=? AND id=?').bind(owner,id).first<Receipt>();
 if(!receipt||receipt.folder!==folder||receipt.kind!==kind||receipt.filename!==filename||receipt.fingerprint!==fingerprint)throw new ApiError('같은 업로드 작업의 사진 내용이 달라졌습니다. 사진을 다시 선택해 주세요.',409);
 if(receipt.state==='saved'){
  const photo=saved?await saved():await db.prepare('SELECT id,folder,kind,filename,content_type,size,created_at FROM photos WHERE owner=? AND id=? AND deleted=0').bind(owner,receipt.photo_id).first();
  if(!photo)throw new ApiError('이미 삭제된 사진의 업로드 작업입니다. 새로 올리려면 사진을 다시 선택해 주세요.',410);
  return {photo,id:receipt.photo_id,attempt,key:''};
 }
 // A new attempt is fenced: an expired worker cannot publish after its successor.
 const claimed=await db.prepare("UPDATE upload_receipts SET state='writing',attempt=?,started_at=? WHERE owner=? AND id=? AND (state='ready' OR (state='writing' AND started_at<?)) RETURNING photo_id").bind(attempt,now,owner,id,now-600000).first<{photo_id:string}>();
 if(!claimed)throw new ApiError('이 사진을 저장 중입니다. 잠시 후 같은 사진으로 다시 시도해 주세요.',409);
 const key=`photos/${owner}/${claimed.photo_id}/${attempt}`;
 await db.prepare('INSERT INTO upload_attempts(object_key,owner,upload_id,started_at) VALUES(?,?,?,?)').bind(key,owner,id,now).run();
 return {photo:null,id:claimed.photo_id,attempt,key};
}
