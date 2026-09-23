import {failure,identity,json,requireSameOrigin,storage} from '@/lib/storage';
export async function POST(request:Request){try{
 requireSameOrigin(request);const owner=await identity(request),{db,bucket}=storage(),before=Date.now()-600000;
 const attempts=await db.prepare('SELECT object_key,upload_id FROM upload_attempts WHERE owner=? AND started_at<? ORDER BY started_at LIMIT 5').bind(owner,before).all<{object_key:string;upload_id:string}>();
 let removed=0;
 for(const item of attempts.results){
  const attempt=item.object_key.split('/').at(-1);
  // Fence the old writer before checking whether it committed; never remove published objects.
  await db.prepare("UPDATE upload_receipts SET state='ready',attempt=? WHERE owner=? AND id=? AND attempt=? AND state='writing' AND started_at<?").bind(crypto.randomUUID(),owner,item.upload_id,attempt,before).run();
  const live=await db.prepare('SELECT id FROM photos WHERE owner=? AND object_key=? UNION ALL SELECT id FROM restore_objects WHERE owner=? AND object_key=? LIMIT 1').bind(owner,item.object_key,owner,item.object_key).first();
  if(!live){await bucket.delete(item.object_key);removed++;}
  await db.prepare('DELETE FROM upload_attempts WHERE object_key=? AND owner=?').bind(item.object_key,owner).run();
 }
 return json({removed,more:attempts.results.length===5});
}catch(e){return failure(e);}}
