import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
export async function testRuntime(options={}){
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url));
 const paths=(await readdir(root,{recursive:true})).filter(p=>/\.(m?js)$/.test(p));
 const adminKey='synthetic-local-test-admin-0123456789',owner='synthetic-owner',origin='https://hana.test';
 const mf=new Miniflare({modules:[{type:'ESModule',path:root+'index.js'},...paths.filter(p=>p!=='index.js').map(p=>({type:'ESModule',path:root+p}))],modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'synthetic-db'},r2Buckets:['BUCKET'],bindings:{ADMIN_SETUP_KEY:adminKey,SITE_DATA_OWNER:owner},cf:false});
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){await options.beforeMigration?.(db,file);for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint'))await db.prepare(sql.trim()).run();}
 const setup=await mf.dispatchFetch(origin+'/api/account',{method:'POST',headers:{origin,'content-type':'application/json','x-admin-key':adminKey},body:JSON.stringify({username:'synthetic',password:'synthetic-password-12345'})});
 assert.equal(setup.status,200);const cookie=setup.headers.get('set-cookie').split(';')[0];
 await db.prepare('INSERT INTO folder_seed_state(owner) VALUES (?) ON CONFLICT DO NOTHING').bind(owner).run();
 const request=(url,options={})=>mf.dispatchFetch(origin+url,{...options,headers:{cookie,origin,...options.headers}});
 const folder=async(id='fixture')=>db.prepare("INSERT INTO survey_folders(owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index) VALUES(?,?,'테스트','2026-09-23',?,'','','가상자료','[]','','',1,0)").bind(owner,id,id).run();
 return {mf,db,owner,adminKey,origin,cookie,request,folder,close:()=>mf.dispose()};
}
