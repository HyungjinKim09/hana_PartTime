import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const configuration=resolve('cloudflare/deployment.json');
let target;
try{target=JSON.parse(await readFile(configuration,'utf8'));}
catch{throw new Error('먼저 cloudflare/deployment.json에 본인 Cloudflare account_id와 생성한 database_id를 설정해 주세요. 원격 자원은 아직 변경하지 않았습니다.');}
if(!/^[a-f0-9]{32}$/.test(target.account_id||'') || !/^[a-f0-9-]{36}$/.test(target.database_id||'') || target.database_id==='00000000-0000-4000-8000-000000000000')throw new Error('실제 Cloudflare 계정 ID와 D1 데이터베이스 ID가 필요합니다.');
const node=process.execPath;
function run(script,args=[],capture=false){
  const result=spawnSync(node,[script,...args],{cwd:root,stdio:capture?'pipe':'inherit',encoding:'utf8',windowsHide:true,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:target.account_id,WRANGLER_SEND_METRICS:'false'}});
  if(capture){process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');}
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`배포 단계 실패: ${script} (exit ${result.status})`);
  return result.stdout||'';
}
const wrangler='node_modules/wrangler/bin/wrangler.js';
run('scripts/verify.mjs');
const built=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
if(built.account_id!==target.account_id || built.d1_databases?.[0]?.database_id!==target.database_id || built.name!=='hanaparttime')throw new Error('빌드 대상 계정 검증 실패. 배포를 중단했습니다.');
built.d1_databases[0].migrations_dir='../../drizzle';
await writeFile('dist/server/wrangler.json',JSON.stringify(built,null,2));
if(process.argv.includes('--check')){
  run(wrangler,['deploy','--config','dist/server/wrangler.json','--dry-run']);
  console.log('로컬 배포 검증 완료. 원격 배포는 수행하지 않았습니다.');
}else{
  const secrets=resolve('.deploy-secrets/production.json');
  const {ADMIN_SETUP_KEY,TURNSTILE_SITE_KEY,TURNSTILE_SECRET}=JSON.parse(await readFile(secrets,'utf8'));
  if(typeof ADMIN_SETUP_KEY!=='string'||ADMIN_SETUP_KEY.length<32)throw new Error('관리 키가 올바르지 않습니다.');
  if(typeof TURNSTILE_SITE_KEY!=='string'||!TURNSTILE_SITE_KEY.trim()||typeof TURNSTILE_SECRET!=='string'||!TURNSTILE_SECRET.trim()){
    throw new Error('운영 배포 전에 Turnstile 사이트 키와 비밀 키를 설정해 주세요.');
  }
  // Validate the login configuration before touching the production database.
  run(wrangler,['d1','migrations','apply','DB','--remote','--config','dist/server/wrangler.json']);
  const output=run(wrangler,['deploy','--config','dist/server/wrangler.json','--secrets-file',secrets],true);
  const provenance=JSON.parse(await readFile('dist/build-provenance.json','utf8'));
  await mkdir('.sites-runtime',{recursive:true});
  await appendFile('.sites-runtime/deployments.jsonl',JSON.stringify({...provenance,deployedAt:new Date().toISOString(),worker:built.name,versionId:output.match(/Version ID:\s*([a-f0-9-]{36})/i)?.[1]||null})+'\n');
  console.log('Cloudflare 직접 배포 완료. 관리 키는 .deploy-secrets/production.json에 보관됩니다. 공개 저장소에 올리지 마세요.');
}
