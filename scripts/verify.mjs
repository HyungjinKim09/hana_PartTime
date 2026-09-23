import {spawnSync} from 'node:child_process';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const candidates=[process.env.HANA_PYTHON,'python','python3',join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe')].filter(Boolean);
let python;
for(const candidate of candidates){const probe=spawnSync(candidate,['-c','import sys;print(sys.executable)'],{encoding:'utf8',timeout:10000,windowsHide:true});if(probe.status===0){python=probe.stdout.trim();break;}}
if(!python)throw Error('Python 3 is needed to independently verify ZIP/Visio. Install Python or set HANA_PYTHON to its executable.');
const env={...process.env,PATH:dirname(python)+(process.platform==='win32'?';':':')+process.env.PATH,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',WRANGLER_SEND_METRICS:'false'};
function run(args){console.log('\nVerify:',args.join(' '));const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)throw Error('Verification failed: '+args.join(' '));}
run(['node_modules/typescript/bin/tsc','--noEmit']);
run(['node_modules/eslint/bin/eslint.js','app','lib','db','cloudflare','scripts/verify.mjs','scripts/deploy-cloudflare.mjs']);
const tests=await readdir('tests');run(['--test',...tests.filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f)]);
run(['scripts/prepare-ocr.mjs']);
const tracked=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'});if(tracked.status!==0)throw Error('Git source inventory failed');
const hash=createHash('sha256');for(const path of [...new Set(tracked.stdout.split('\0').filter(Boolean))].sort()){if(!/^(app\/|lib\/|components\/|hooks\/|db\/|drizzle\/|scripts\/|public\/|cloudflare\/|[^/]+\.(?:json|mjs|ts|js))/.test(path))continue;try{const contents=await readFile(path);hash.update(path+'\0');hash.update(contents);hash.update('\0');}catch(e){if(e.code!=='ENOENT')throw e;}}
const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
run(['node_modules/vite/bin/vite.js','build']);
for(const test of tests.filter(f=>f.endsWith('.integration.mjs')).sort())run(['tests/'+test]);
const manifest={verifiedAt:new Date().toISOString(),gitRevision:revision,sourceSha256:hash.digest('hex'),node:process.version,unitFiles:tests.filter(f=>f.endsWith('.test.mjs')).length,integrationFiles:tests.filter(f=>f.endsWith('.integration.mjs')).length};
await writeFile('dist/build-provenance.json',JSON.stringify(manifest,null,2));
console.log('\nAll verification gates passed. Source SHA-256:',manifest.sourceSha256);
