import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {randomBytes} from 'node:crypto';

// Distributed at the root of the prebuilt Windows/macOS deployment package.
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
const version=process.versions.node.split('.').map(Number);
if(version[0]<22 || (version[0]===22 && version[1]<13))throw new Error('Node.js 22.13 이상을 설치한 후 다시 실행해 주세요.');
const npmCommand=process.platform==='win32'?'npx.cmd':'npx';
const commandEnv={...process.env,WRANGLER_SEND_METRICS:'false',NO_COLOR:'1'};
function wrangler(args,{capture=false,allowFailure=false}={}){
  // Every CLI argument is a fixed relative path or literal: no user input is interpolated into a shell.
  const result=spawnSync(npmCommand,['--yes','wrangler@4.92.0',...args],{
    cwd:process.cwd(),env:commandEnv,shell:process.platform==='win32',
    stdio:capture?['ignore','pipe','pipe']:'inherit',encoding:'utf8',maxBuffer:16*1024*1024,
  });
  if(result.error)throw result.error;
  if(result.status!==0 && !allowFailure){
    if(capture)process.stderr.write(result.stderr||'');
    throw new Error(`Cloudflare 명령 실패: ${args.slice(0,3).join(' ')}. 위 오류를 확인해 주세요.`);
  }
  return result;
}
function jsonOutput(result){
  if(result.status!==0)throw new Error('Cloudflare 계정 연결을 확인해 주세요.');
  try{return JSON.parse(result.stdout.trim());}
  catch{throw new Error('Cloudflare 응답을 해석하지 못했습니다. 인증키 없이 오류 메시지만 알려주세요.');}
}

async function main(){
  console.log('\nHanaparttime — 본인 Cloudflare 계정으로 전체 배포\n처음 실행할 때 공식 배포 도구를 내려받습니다.\n');
  if(process.argv.includes('--check')){
    wrangler(['deploy','--config','dist/server/wrangler.json','--dry-run']);
    console.log('로컬 파일 검사만 완료했습니다. 계정 자원은 변경하지 않았습니다.');return;
  }
  let login=wrangler(['whoami','--json'],{capture:true,allowFailure:true});
  if(login.status!==0){
    console.log('열리는 일반 브라우저에서 Cloudflare 로그인과 Allow 승인을 완료해 주세요.');
    wrangler(['login']);login=wrangler(['whoami','--json'],{capture:true});
  }
  const identity=jsonOutput(login);
  if(!identity.loggedIn || !Array.isArray(identity.accounts) || identity.accounts.length===0)throw new Error('배포할 수 있는 Cloudflare 계정이 없습니다.');
  let account=identity.accounts[0];
  if(identity.accounts.length>1){
    identity.accounts.forEach((a,i)=>console.log(`${i+1}. ${a.name} (${a.id})`));
    const terminal=createInterface({input:process.stdin,output:process.stdout});
    const answer=await terminal.question('배포할 계정 번호: ');terminal.close();
    if(!/^[1-9][0-9]*$/.test(answer.trim()))throw new Error('계정 번호를 확인해 주세요.');
    account=identity.accounts[Number(answer)-1];
  }
  if(!account || !/^[a-f0-9]{32}$/.test(account.id))throw new Error('배포 계정 ID를 확인하지 못했습니다.');
  commandEnv.CLOUDFLARE_ACCOUNT_ID=account.id;
  console.log(`\n대상 계정: ${account.name}\n서버: hanaparttime / DB: hanaparttime-db / 비공개 사진 저장소: hanaparttime-photos\n`);
  const configPath='dist/server/wrangler.json';
  const config=JSON.parse(await readFile(configPath,'utf8'));
  if(config.name!=='hanaparttime')throw new Error('배포 파일 이름이 올바르지 않습니다.');
  config.account_id=account.id;
  await writeFile(configPath,JSON.stringify(config,null,2));
  let databases=jsonOutput(wrangler(['d1','list','--json'],{capture:true}));
  if(!Array.isArray(databases))throw new Error('DB 목록을 읽지 못했습니다.');
  let database=databases.find(d=>d.name==='hanaparttime-db');
  if(!database){
    wrangler(['d1','create','hanaparttime-db','--location','apac','--no-update-config']);
    databases=jsonOutput(wrangler(['d1','list','--json'],{capture:true}));
    database=databases.find(d=>d.name==='hanaparttime-db');
  }
  if(!database || !/^[a-f0-9-]{36}$/.test(database.uuid))throw new Error('생성된 DB ID를 확인하지 못했습니다.');
  config.d1_databases=[{binding:'DB',database_name:'hanaparttime-db',database_id:database.uuid,migrations_dir:'../../drizzle'}];
  config.r2_buckets=[{binding:'BUCKET',bucket_name:'hanaparttime-photos'}];
  await writeFile(configPath,JSON.stringify(config,null,2));
  const bucket=wrangler(['r2','bucket','info','hanaparttime-photos','--json'],{capture:true,allowFailure:true});
  if(bucket.status!==0){
    console.log('사진 저장소를 확인·생성합니다. 결제 수단이나 R2 활성화가 필요하면 여기서 중단됩니다.');
    wrangler(['r2','bucket','create','hanaparttime-photos','--location','apac','--no-update-config']);
  }
  wrangler(['d1','migrations','apply','DB','--remote','--config',configPath]);
  await mkdir('.deploy-secrets',{recursive:true,mode:0o700});
  const secretsPath='.deploy-secrets/production.json';
  try{await access(secretsPath);}catch{await writeFile(secretsPath,JSON.stringify({ADMIN_SETUP_KEY:randomBytes(32).toString('hex')}),{mode:0o600,flag:'wx'});}
  const secrets=JSON.parse(await readFile(secretsPath,'utf8'));
  if(typeof secrets.ADMIN_SETUP_KEY!=='string'||secrets.ADMIN_SETUP_KEY.length<32)throw new Error('관리 키 파일을 확인해 주세요.');
  wrangler(['deploy','--config',configPath,'--secrets-file',secretsPath]);
  console.log('\n배포 명령이 완료되었습니다. 위에 표시된 https://hanaparttime....workers.dev 주소를 열어 주세요.');
  console.log('관리자 계정 설정에서 .deploy-secrets/production.json에 있는 관리 키로 공용 계정을 설정하세요.');
  console.log('관리 키와 인증키는 채팅에 보내지 마세요. 새 주소만 알려 주세요.');
  console.log('기존 사이트의 사진·비고는 아직 복사되지 않았습니다. 자료 이전과 새 주소 동작 검증이 남아 있습니다.');
}
try{await main();}catch(error){console.error('\n중단: '+error.message);console.error('기존 사이트와 원본 자료는 변경하지 않았습니다. 오류 문구를 알려 주세요.');process.exitCode=1;}
