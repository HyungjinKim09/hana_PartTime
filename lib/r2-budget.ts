// Application-only safety margins, not an account-wide Cloudflare billing cap.
export const R2_LIMITS={storage:8_000_000_000,write:50_000,read:500_000} as const;
export class BudgetError extends Error {
  status=429;
}
type Operation='read'|'write';
function dates(now:Date){
  return {today:now.toISOString().slice(0,10),since:new Date(now.getTime()-31*86400000).toISOString().slice(0,10)};
}
export async function reserveOperations(db:D1Database,kind:Operation,count:number,now=new Date()){
  if(!Number.isSafeInteger(count)||count<0)throw new Error('Invalid operation reservation');
  if(count===0)return;
  const {today,since}=dates(now);
  // One conditional SQL statement serializes concurrent reservations on D1.
  // Include 32 UTC calendar dates so a billing month cannot reset this early.
  const result=await db.prepare(`INSERT INTO r2_operation_usage (day,kind,amount)
    SELECT ?,?,? WHERE COALESCE((SELECT SUM(amount) FROM r2_operation_usage WHERE kind=? AND day>=?),0)+?<=?
    ON CONFLICT(day,kind) DO UPDATE SET amount=amount+excluded.amount RETURNING amount`)
    .bind(today,kind,count,kind,since,count,R2_LIMITS[kind]).first();
  if(!result)throw new BudgetError(kind==='write'
    ?'업로드 사용 한도에 도달했습니다. 최근 32일 사용량이 줄어들면 다시 이용할 수 있습니다. 기존 사진은 보관됩니다.'
    :'사진 열기·다운로드 사용 한도에 도달했습니다. 최근 32일 사용량이 줄어들면 다시 이용할 수 있습니다. 기존 사진은 보관됩니다.');
}
export async function budgetUsage(db:D1Database,now=new Date()){
  const {since}=dates(now);
  const results=await db.batch<{bytes?:number;kind?:string;amount?:number}>([
    db.prepare('SELECT bytes FROM r2_storage_usage WHERE id=1'),
    db.prepare('SELECT kind,SUM(amount) AS amount FROM r2_operation_usage WHERE day>=? GROUP BY kind').bind(since),
  ]);
  const storage=results[0].results[0]?.bytes;
  if(typeof storage!=='number')throw new Error('Missing storage budget');
  const amount=(kind:Operation)=>Number(results[1].results.find(r=>r.kind===kind)?.amount||0);
  return {storageBytes:storage,storageLimit:R2_LIMITS.storage,reads:amount('read'),readLimit:R2_LIMITS.read,writes:amount('write'),writeLimit:R2_LIMITS.write,windowDays:32};
}
export type BudgetUsage=Awaited<ReturnType<typeof budgetUsage>>;
export function guardedBucket(db:D1Database,bucket:R2Bucket){
  const remove=async(key:string)=>{
    // R2 deletes are free. Only release space after confirmed deletion.
    await bucket.delete(key);
    await db.prepare('DELETE FROM r2_object_usage WHERE object_key=?').bind(key).run();
  };
  return {
    async put(key:string,bytes:Uint8Array,options:R2PutOptions){
      await reserveOperations(db,'write',1);
      const reserved=await db.prepare(`INSERT INTO r2_object_usage (object_key,size)
        SELECT ?,? WHERE (SELECT bytes FROM r2_storage_usage WHERE id=1)+?<=? RETURNING object_key`)
        .bind(key,bytes.byteLength,bytes.byteLength,R2_LIMITS.storage).first();
      if(!reserved)throw new BudgetError('저장 용량 한도(8GB)에 도달했습니다. 기기에 원본을 보관하고, 불필요한 사진을 직접 삭제한 뒤 다시 올려 주세요.');
      try{return await bucket.put(key,bytes,options);}
      catch(error){
        // A failed PUT may have reached R2. Retain the reservation if cleanup fails.
        await remove(key).catch(()=>{});
        throw error;
      }
    },
    async get(key:string){
      await reserveOperations(db,'read',1);
      return bucket.get(key);
    },
    delete:remove,
    async issueDownloads(owner:string,keys:string[]){
      await reserveOperations(db,'read',keys.length);
      const now=Date.now();
      const tickets=keys.map(key=>({token:crypto.randomUUID(),key}));
      await db.batch([
        db.prepare('DELETE FROM r2_download_tickets WHERE expires_at<=?').bind(now),
        db.prepare(`INSERT INTO r2_download_tickets (token,owner,object_key,expires_at)
          SELECT json_extract(value,'$.token'),?,json_extract(value,'$.key'),? FROM json_each(?)`)
          .bind(owner,now+3600000,JSON.stringify(tickets)),
      ]);
      return tickets.map(t=>t.token);
    },
    async redeemDownload(owner:string,token:string){
      // Delete/RETURNING is atomic: one prepaid R2 GET, even across concurrent devices.
      const ticket=await db.prepare('DELETE FROM r2_download_tickets WHERE token=? AND owner=? AND expires_at>? RETURNING object_key')
        .bind(token,owner,Date.now()).first<{object_key:string}>();
      if(!ticket)return null;
      return bucket.get(ticket.object_key);
    },
    async reserveDownloads(keys:string[]){
      await reserveOperations(db,'read',keys.length);
      const remaining=new Map<string,number>();
      for(const key of keys)remaining.set(key,(remaining.get(key)||0)+1);
      return async(key:string)=>{
        const count=remaining.get(key)||0;
        if(!count)throw new Error('Download was not reserved');
        remaining.set(key,count-1);
        return bucket.get(key);
      };
    },
  };
}
