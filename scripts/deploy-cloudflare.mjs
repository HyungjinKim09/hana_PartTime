import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
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
function run(script,args=[]){
  const result=spawnSync(node,[script,...args],{cwd:root,stdio:'inherit',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:target.account_id,WRANGLER_SEND_METRICS:'false'}});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`배포 단계 실패: ${script} (exit ${result.status})`);
}
const wrangler='node_modules/wrangler/bin/wrangler.js';
run('scripts/prepare-ocr.mjs');
run('node_modules/vite/bin/vite.js',['build']);
run('node_modules/typescript/bin/tsc',['--noEmit']);
run('tests/storage.integration.mjs');
const built=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
if(built.account_id!==target.account_id || built.d1_databases?.[0]?.database_id!==target.database_id || built.name!=='hanaparttime')throw new Error('빌드 대상 계정 검증 실패. 배포를 중단했습니다.');
if(process.argv.includes('--check')){
  run(wrangler,['deploy','--config','dist/server/wrangler.json','--dry-run']);
  console.log('로컬 배포 검증 완료. 원격 배포는 수행하지 않았습니다.');
}else{
  // An unattended failed auth must not silently choose or create another account.
  run(wrangler,['d1','migrations','apply','DB','--remote','--config','dist/server/wrangler.json']);
  await mkdir('.deploy-secrets',{recursive:true,mode:0o700});
  const secrets=resolve('.deploy-secrets/production.json');
  try{await access(secrets);}catch{await writeFile(secrets,JSON.stringify({ADMIN_SETUP_KEY:randomBytes(32).toString('hex')}),{mode:0o600,flag:'wx'});}
  const key=JSON.parse(await readFile(secrets,'utf8')).ADMIN_SETUP_KEY;
  if(typeof key!=='string'||key.length<32)throw new Error('관리 키가 올바르지 않습니다.');
  run(wrangler,['deploy','--config','dist/server/wrangler.json','--secrets-file',secrets]);
  console.log('Cloudflare 직접 배포 완료. 관리 키는 .deploy-secrets/production.json에 보관됩니다. 공개 저장소에 올리지 마세요.');
}
