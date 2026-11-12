export const LOGIN_TURNSTILE_ACTION='login';
const PRODUCTION_HOST='hanaparttime.isacc7224.workers.dev';
type TurnstileBindings={TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET?:string};

export async function checkLoginTurnstile(request:Request,env:TurnstileBindings):Promise<'ok'|'invalid'|'unavailable'>{
  const hostname=new URL(request.url).hostname;
  const {TURNSTILE_SITE_KEY:siteKey,TURNSTILE_SECRET:secret}=env;
  if(!siteKey&&!secret&&hostname!==PRODUCTION_HOST)return 'ok';
  if(!siteKey||!secret)return 'unavailable';
  const token=request.headers.get('x-hana-turnstile');
  if(!token||token.length>2048)return 'invalid';
  const body=new URLSearchParams({secret,response:token});
  const ip=request.headers.get('cf-connecting-ip');
  if(ip)body.set('remoteip',ip);
  try{
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',body,signal:AbortSignal.timeout(5000),redirect:'manual',
    });
    if(!response.ok)return 'unavailable';
    const result=await response.json() as {success?:boolean;hostname?:string;action?:string};
    return result.success===true&&result.hostname===hostname&&result.action===LOGIN_TURNSTILE_ACTION?'ok':'invalid';
  }catch{return 'unavailable';}
}
