import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {guardedBucket,budgetUsage,reserveOperations,R2_LIMITS} from '../lib/r2-budget.ts';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');

test('R2 budgets enforce concurrent reservations, rolling windows and safe failure recovery',async t=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],r2Buckets:['BUCKET']});
  try{
    const db=await mf.getD1Database('DB'),raw=await mf.getR2Bucket('BUCKET');
    const dir=new URL('../drizzle/',import.meta.url);
    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){
      // Exercise migration backfill with an existing photo, tombstone and schedule.
      if(file.startsWith('0006')){
        for(const [id,size,deleted] of [['old',3,0],['tombstone',4,1]])await db.prepare('INSERT INTO photos (id,owner,folder,filename,object_key,content_type,size,created_at,deleted) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,'owner','folder',id,id,'image/png',size,'2026-09-01',deleted).run();
        await db.prepare('INSERT INTO schedule_imports (id,owner,filename,object_key,content_type,size,draft,created_at) VALUES (?,?,?,?,?,?,?,?)').bind('schedule','owner','schedule.png','schedule','image/png',5,'{}','2026-09-01').run();
      }
      for(const sql of (await readFile(new URL(file,dir),'utf8')).split('--> statement-breakpoint'))await db.prepare(sql.trim()).run();
    }
    assert.equal((await budgetUsage(db)).storageBytes,12,'migration includes schedule originals and tombstones');
    const bucket=guardedBucket(db,raw),bytes=new Uint8Array([1,2,3,4]);
    const reset=async()=>{await db.batch([db.prepare('DELETE FROM r2_object_usage'),db.prepare('DELETE FROM r2_operation_usage')]);};
    await reset();
    await t.test('parallel uploads cannot exceed available bytes',async()=>{
      await db.prepare('INSERT INTO r2_object_usage VALUES (?,?)').bind('reserved',R2_LIMITS.storage-4).run();
      const results=await Promise.allSettled(['a','b'].map(k=>bucket.put(k,bytes,{})));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
      assert.equal((await budgetUsage(db)).storageBytes,R2_LIMITS.storage);
      const winner=results[0].status==='fulfilled'?'a':'b';
      assert.deepEqual(new Uint8Array(await (await bucket.get(winner)).arrayBuffer()),bytes);
      await bucket.delete(winner);await bucket.delete(winner);
      assert.equal((await budgetUsage(db)).storageBytes,R2_LIMITS.storage-4,'idempotent deletion never releases twice');
    });
    await reset();
    await t.test('parallel writes and reads reserve atomically, including month boundaries',async()=>{
      const day='2026-09-30',now=new Date('2026-10-01T12:00:00Z');
      await db.prepare('INSERT INTO r2_operation_usage VALUES (?,?,?)').bind(day,'write',R2_LIMITS.write-1).run();
      const writes=await Promise.allSettled([reserveOperations(db,'write',1,now),reserveOperations(db,'write',1,now)]);
      assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(writes.find(r=>r.status==='rejected').reason.status,429);
      await db.prepare('INSERT INTO r2_operation_usage VALUES (?,?,?)').bind(day,'read',R2_LIMITS.read-1).run();
      const reads=await Promise.allSettled([reserveOperations(db,'read',1,now),reserveOperations(db,'read',1,now)]);
      assert.equal(reads.filter(r=>r.status==='fulfilled').length,1);
      await assert.rejects(reserveOperations(db,'write',1,new Date('2026-10-31T12:00:00Z')),{status:429});
      await reserveOperations(db,'write',1,new Date('2026-11-02T00:00:00Z'));
      assert.equal((await budgetUsage(db,new Date('2026-11-02T00:00:00Z'))).writes,1);
    });
    await reset();
    await t.test('an exhausted write budget makes no R2 PUT',async()=>{
      await reserveOperations(db,'write',R2_LIMITS.write);
      await assert.rejects(bucket.put('blocked',bytes,{}),{status:429});
      assert.equal(await raw.get('blocked'),null);
      assert.equal((await budgetUsage(db)).storageBytes,0);
    });
    await reset();
    await t.test('ambiguous upload failure retains space until confirmed cleanup',async()=>{
      const faulty=guardedBucket(db,{
        put:async(...args)=>{await raw.put(...args);throw new Error('Lost PUT response');},
        delete:async()=>{throw new Error('Cleanup unavailable');},
      });
      await assert.rejects(faulty.put('uncertain',bytes,{}),/Lost PUT/);
      assert.equal((await budgetUsage(db)).storageBytes,4);
      assert.ok(await raw.get('uncertain'));
      await bucket.delete('uncertain');
      assert.equal((await budgetUsage(db)).storageBytes,0);
      assert.equal((await budgetUsage(db)).writes,1,'failed operations are not refunded');
    });
    await reset();
    await t.test('ZIP reservations reject in full and cannot be reused',async()=>{
      await raw.put('one',bytes);await raw.put('two',bytes);
      await reserveOperations(db,'read',R2_LIMITS.read-1);
      await assert.rejects(bucket.reserveDownloads(['one','two']),{status:429});
      const download=await bucket.reserveDownloads(['one']);
      assert.equal((await download('one')).size,4);
      await assert.rejects(download('one'),/not reserved/);
      await assert.rejects(bucket.get('two'),{status:429});
      assert.equal((await budgetUsage(db)).reads,R2_LIMITS.read);
    });
    await t.test('missing accounting tables block R2 access',async()=>{
      await db.prepare('DROP TABLE r2_operation_usage').run();
      await assert.rejects(bucket.put('no-accounting',bytes,{}));
      assert.equal(await raw.get('no-accounting'),null);
      await assert.rejects(bucket.get('one'));
    });
  }finally{await mf.dispose();}
});
