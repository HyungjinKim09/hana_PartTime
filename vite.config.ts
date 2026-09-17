import vinext from 'vinext';
import {defineConfig} from 'vite';
import {cloudflare} from '@cloudflare/vite-plugin';
import {existsSync,readFileSync} from 'node:fs';

const deploymentFile = './cloudflare/deployment.json';
const deployment = existsSync(deploymentFile) ? JSON.parse(readFileSync(deploymentFile,'utf8')) : {};

export default defineConfig({
  plugins:[vinext(),cloudflare({
    viteEnvironment:{name:'rsc',childEnvironments:['ssr']},
    inspectorPort:false,
    config:{
      name:'hanaparttime',
      main:'./cloudflare/worker.ts',
      compatibility_date:'2026-05-15',
      compatibility_flags:['nodejs_compat'],
      workers_dev:true,
      ...(deployment.account_id ? {account_id:deployment.account_id}:{}),
      d1_databases:[{binding:'DB',database_name:'hanaparttime-db',database_id:deployment.database_id || '00000000-0000-4000-8000-000000000000',migrations_dir:'./drizzle'}],
      r2_buckets:[{binding:'BUCKET',bucket_name:'hanaparttime-photos'}],
      ai:{binding:'AI'},
      vars:{SITE_DATA_OWNER:deployment.data_owner || 'hanaparttime'},
      observability:{enabled:true},
    },
  })],
});
