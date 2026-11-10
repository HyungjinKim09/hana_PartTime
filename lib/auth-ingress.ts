type AuthLimiters={AUTH_LOGIN_IP?:RateLimit;AUTH_LOGIN_TOTAL?:RateLimit;AUTH_SESSION_IP?:RateLimit;AUTH_SESSION_TOTAL?:RateLimit};

// Mirror the router's segment decoding, dot/slash normalization and .rsc alias.
// Classification never keys counters on a caller-controlled username or cookie.
function authPath(pathname:string){
 const parts:string[]=[];
 for(const raw of pathname.split('/')){
  const part=decodeURIComponent(raw);
  if(!part||part==='.')continue;
  if(part==='..'){parts.pop();continue;}
  parts.push(part);
 }
 return ('/'+parts.join('/')).replace(/\.rsc$/,'');
}
export async function authIngress(request:Request,env:AuthLimiters):Promise<Response|null>{
 const url=new URL(request.url);let path:string;
 const deny=(error:string,status:number,extra:Record<string,string>={})=>Response.json({error},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});
 try{path=authPath(url.pathname);}catch{return deny('요청 경로를 확인해 주세요.',400);}
 if(!['/api/session','/api/account','/api/session/refresh'].includes(path))return null;
 const methods=path==='/api/session'?['POST','DELETE']:['POST'];
 if(!methods.includes(request.method))return deny('허용되지 않은 요청입니다.',405,{Allow:methods.join(', ')});
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')!==url.origin)return deny('이 사이트의 로그인 화면에서 다시 시도해 주세요.',403);
 const login=request.method==='POST'&&(path==='/api/session'||path==='/api/account');
 const perIp=login?env.AUTH_LOGIN_IP:env.AUTH_SESSION_IP,total=login?env.AUTH_LOGIN_TOTAL:env.AUTH_SESSION_TOTAL;
 // Missing/broken protection must never silently fall through to D1.
 if(!perIp||!total)return deny('로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',503,{'Retry-After':'60'});
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 try{
  const prefix=login?'hana:login:':'hana:session:';
  if(!(await perIp.limit({key:prefix+ip})).success||!(await total.limit({key:prefix+'all'})).success)return deny('요청이 많습니다. 1분 후 다시 시도해 주세요.',429,{'Retry-After':'60'});
 }catch{return deny('로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',503,{'Retry-After':'60'});}
 return null;
}
