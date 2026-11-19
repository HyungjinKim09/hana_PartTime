import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';

// Count real D1 metadata at the worker boundary. The wrapper unwraps statements
// before batch() so Miniflare still executes native D1PreparedStatements.
const t=await testRuntime({entryWrapper:`import worker from './index.js';import {withEnv} from 'cloudflare:workers';
export default {fetch(request,env,ctx){
 let reads=0,writes=0;
 const add=m=>{reads+=m?.rows_read||0;writes+=m?.rows_written||0;};
 const db=new Proxy(env.DB,{get(target,key){
  if(key==='prepare')return sql=>{
   const wrap=bound=>({native:bound,
    bind(...args){return wrap(bound.bind(...args));},
    async all(...a){const r=await bound.all(...a);add(r.meta);return r;},
    async first(...a){const r=await bound.all();add(r.meta);const row=r.results[0];return a[0]&&row?row[a[0]]:row||null;},
    async run(...a){const r=await bound.run(...a);add(r.meta);return r;}
   });
   return wrap(target.prepare(sql));
  };
  if(key==='batch')return async statements=>{const results=await target.batch(statements.map(s=>s.native||s));for(const r of results)add(r.meta);return results;};
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 const bindings={...env,DB:db};
 return withEnv(bindings,async()=>{const r=await worker.fetch(request,bindings,ctx);const response=new Response(r.body,r);response.headers.set('x-synthetic-d1-reads',String(reads));response.headers.set('x-synthetic-d1-writes',String(writes));return response;});
}};`});
const parseCost=response=>({reads:Number(response.headers.get('x-synthetic-d1-reads')||0),writes:Number(response.headers.get('x-synthetic-d1-writes')||0)});
const cookieJar=response=>response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
try{
  // The original query scaled with every folder belonging to an owner. Keep
  // 730 same-owner folders in the fixture while changing only received groups.
  const unrelated=Array.from({length:730},(_,i)=>({id:`cost-unrelated-${i}`,folder:`cost-unrelated-${i}`}));
  await t.db.prepare(`INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index)
    SELECT ?,'cost-unrelated-'||value,'unrelated','2026-11-19','cost-unrelated-'||value,'','','','[]','','',1,0 FROM json_each(?)`)
    .bind(t.owner,JSON.stringify(unrelated.map((_,i)=>i))).run();
  const groups=Array.from({length:621},(_,i)=>({id:`cost-target-${i}`,folder:`cost-target-${i}`,revision:0,total:1}));
  await t.db.prepare(`INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index)
    SELECT ?,json_extract(value,'$.id'),'cost-target','2026-11-19',json_extract(value,'$.id'),'','','','[]','','',1,0 FROM json_each(?)`)
    .bind(t.owner,JSON.stringify(groups)).run();
  await t.db.prepare(`INSERT INTO folder_stats(owner,folder,count,photo_count)
    SELECT ?,json_extract(value,'$.folder'),1,1 FROM json_each(?)`).bind(t.owner,JSON.stringify(groups)).run();

  const login=await t.request('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'synthetic',password:'synthetic-password-12345'})});
  assert.equal(login.status,200);const cookie=cookieJar(login);
  const readings=[];
  for(const count of [1,10,100,510]){
    const start=readings.reduce((n,x)=>n+x.count,0),receipt=crypto.randomUUID();
    const folderPhotos=JSON.stringify(groups.slice(start,start+count).map(({folder,revision,total})=>({folder,revision,total,ranges:[[0,total]]})));
    await t.db.prepare('INSERT INTO archive_completion_receipts(owner,id,folder_photos,expires_at) VALUES(?,?,?,?)')
      .bind(t.owner,receipt,folderPhotos,Date.now()+3600000).run();
    const response=await t.request('/api/export?completed=1',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({receipts:[receipt]})});
    assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.marked,count);
    const cost=parseCost(response);assert.ok(cost.writes>=count,`completion wrote ${cost.writes} for ${count} folders`);
    assert.ok(cost.reads<=20*count+200,`completion with ${count} groups read ${cost.reads} rows; should be bounded by received folders, not 730 unrelated folders`);
    readings.push({count,...cost});
  }
  assert.ok(readings[2].reads<readings[1].reads*15,`100 groups read ${readings[2].reads}, disproportionate to 10 groups at ${readings[1].reads}`);
  console.log(`PASS: archive completion D1 rows (730 unrelated folders): ${readings.map(x=>`${x.count} groups=${x.reads}R/${x.writes}W`).join(', ')}`);

  if(process.env.HANA_ARCHIVE_BENCHMARK==='1'){
  // Measure the ordinary issue -> per-photo redeem -> completion path with
  // actual routes and R2 objects for 100/10 and 1,000/100 fixtures.
  const quotaDays=Array.from({length:32},(_,i)=>i);
  await t.db.prepare(`INSERT INTO r2_operation_usage(day,kind,amount)
    SELECT date(?,'-'||value||' days'),'read',1 FROM json_each(?) WHERE 1 ON CONFLICT(day,kind) DO NOTHING`)
    .bind(new Date().toISOString().slice(0,10),JSON.stringify(quotaDays)).run();
  const bucket=await t.mf.getR2Bucket('BUCKET'),png=new Uint8Array([137,80,78,71]);
  const scenarios=[{prefix:'bench100',folders:10,photos:100},{prefix:'bench1000',folders:100,photos:1000}];
  for(const scenario of scenarios){
    const folderRows=Array.from({length:scenario.folders},(_,i)=>({id:`${scenario.prefix}-folder-${i}`}));
    await t.db.prepare(`INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index)
      SELECT ?,json_extract(value,'$.id'),?,'2026-11-18',json_extract(value,'$.id'),'','','','[]','','',1,0 FROM json_each(?)`)
      .bind(t.owner,scenario.prefix,JSON.stringify(folderRows)).run();
    const photoRows=Array.from({length:scenario.photos},(_,i)=>({id:`${scenario.prefix}-photo-${i}`,folder:`${scenario.prefix}-folder-${i%scenario.folders}`,key:`${scenario.prefix}-key-${i}`}));
    for(const photo of photoRows)await bucket.put(photo.key,png);
    await t.db.prepare(`INSERT INTO photos(id,owner,folder,filename,object_key,content_type,size,created_at,kind)
      SELECT json_extract(value,'$.id'),?,json_extract(value,'$.folder'),'test.png',json_extract(value,'$.key'),'image/png',4,'2026-11-18T00:00:00Z','photo' FROM json_each(?)`)
      .bind(t.owner,JSON.stringify(photoRows)).run();
    for(let pass=1;pass<=2;pass++){
      const manifestResponse=await t.request(`/api/export?region=${scenario.prefix}&date=2026-11-18&track=1`,{method:'POST',headers:{cookie}});
      assert.equal(manifestResponse.status,200);const manifest=await manifestResponse.json();assert.equal(manifest.files,scenario.photos);
      let totals=parseCost(manifestResponse);
      for(const entry of manifest.entries.filter(e=>e.url)){
        const response=await t.request(entry.url,{headers:{cookie}});assert.equal(response.status,200);await response.arrayBuffer();
        const cost=parseCost(response);totals.reads+=cost.reads;totals.writes+=cost.writes;
      }
      const completion=await t.request('/api/export?completed=1',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({receipts:manifest.downloadReceipts})});
      assert.equal(completion.status,200);const result=await completion.json();assert.equal(result.marked,pass===1?scenario.folders:0);
      const completionCost=parseCost(completion);totals.reads+=completionCost.reads;totals.writes+=completionCost.writes;
      console.log(`PASS: ${scenario.photos} photo / ${scenario.folders} folder pass ${pass}: ${totals.reads} D1 rows read, ${totals.writes} written (completion ${completionCost.reads}R/${completionCost.writes}W)`);
    }
  }
  }
}finally{await t.close();}
