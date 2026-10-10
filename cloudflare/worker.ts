import app from 'vinext/server/fetch-handler';
import {COOKIE,REFRESH_COOKIE,cookieValue,lookupSession} from '../lib/session-lookup';
import {refreshSession,tokenCookies,upgradeLegacySession} from '../lib/refresh-sessions';
import {guardedBucket,BudgetError} from '../lib/r2-budget';

// Return the native R2 stream directly. Framework transport of binary bodies
// adds per-chunk CPU cost, which can terminate large downloads on Workers Free.
async function handle(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/api/export/'))return app.fetch(request,env,ctx);
    const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
    const error=(message:string,status:number)=>Response.json({error:message},{status,headers});
    if(request.method!=='GET')return error('허용되지 않은 요청입니다.',405);
    try{
      if(!env.DB||!env.BUCKET)return error('사진 저장소에 연결할 수 없습니다.',503);
      const user=await lookupSession(env.DB,request.headers.get('cookie')||'');
      if(!user)return error('로그인 후 다시 시도해 주세요.',401);
      const token=path.slice('/api/export/'.length);
      if(!/^[a-f0-9-]{36}$/.test(token))return error('다운로드를 다시 시작해 주세요.',410);
      const object=await guardedBucket(env.DB,env.BUCKET).redeemDownload(user.owner,token);
      if(!object)return error('다운로드 준비가 만료되었거나 원본을 찾을 수 없습니다. ZIP 다운로드를 다시 시작해 주세요.',410);
      return new Response(object.body,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(object.size)}});
    }catch(cause){
      if(cause instanceof BudgetError)return error(cause.message,cause.status);
      return error('원본을 받지 못했습니다. ZIP 다운로드를 다시 시도해 주세요.',503);
    }
}

export default {
  async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
    const path=new URL(request.url).pathname,cookies=request.headers.get('cookie')||'';
    const authRoute=path==='/api/account'||path==='/api/session'||path.startsWith('/api/session/');
    const navigation=request.method==='GET'&&request.headers.get('sec-fetch-mode')==='navigate'&&request.headers.get('sec-fetch-dest')==='document';
    const sameOrigin=(!request.headers.get('origin')||request.headers.get('origin')===new URL(request.url).origin)&&(request.headers.get('sec-fetch-site')!=='cross-site'||navigation);
    if(authRoute||!sameOrigin||!(path==='/'||path.startsWith('/api/'))||(!cookieValue(cookies,REFRESH_COOKIE)&&!cookieValue(cookies,COOKIE)))return handle(request,env,ctx);
    try{
      if(!env.DB)throw Error('Database is unavailable');
      const hasRefresh=!!cookieValue(cookies,REFRESH_COOKIE);
      if(hasRefresh&&await lookupSession(env.DB,cookies))return handle(request,env,ctx);
      const pair=hasRefresh?await refreshSession(env.DB,cookies,env.ADMIN_SETUP_KEY):await upgradeLegacySession(env.DB,cookies,env.ADMIN_SETUP_KEY);
      if(!pair)return handle(request,env,ctx);
      const headers=new Headers(request.headers);
      headers.set('cookie',cookies.split(';').filter(part=>!part.trim().startsWith(COOKIE+'=')).concat(`${COOKIE}=${pair.access}`).join('; '));
      const response=await handle(new Request(request,{headers}),env,ctx);
      const result=new Response(response.body,response);
      for(const cookie of tokenCookies(pair))result.headers.append('Set-Cookie',cookie);
      result.headers.set('Cache-Control','private, no-store');
      return result;
    }catch{
      return Response.json({error:'로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
