import app from 'vinext/server/fetch-handler';
import {lookupSession} from '../lib/session-lookup';
import {guardedBucket,BudgetError} from '../lib/r2-budget';

// Return the native R2 stream directly. Framework transport of binary bodies
// adds per-chunk CPU cost, which can terminate large downloads on Workers Free.
export default {
  async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
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
  },
} satisfies ExportedHandler<Cloudflare.Env>;
