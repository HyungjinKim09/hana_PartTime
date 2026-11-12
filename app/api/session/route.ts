import {z} from 'zod';
import {ApiError,failure,limitedBody,storage} from '@/lib/storage';
import {accountRetryAfter,clearAccountFailures,recordAccountFailure} from '@/lib/account-login-limits';
import {allowLogin,digest,equalHash,getAccount,issueSession,passwordHash,revokeSession,sessionHeaders} from '@/lib/site-auth';
export const dynamic='force-dynamic';
export function checkOrigin(request:Request){
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('이 사이트의 로그인 화면에서 다시 시도해 주세요.',403);
}
export const credentials=z.object({username:z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/),password:z.string().min(12).max(128)}).strict();
export async function readCredentials(request:Request){
  try{return credentials.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,2048))));}catch{throw new ApiError('아이디는 영문·숫자 등 3~40자, 비밀번호는 12~128자로 입력해 주세요.');}
}
export async function POST(request:Request){try{
  checkOrigin(request);
  const input=await readCredentials(request),{db}=storage();
  const key=await digest('hana-account-login:'+input.username.toLowerCase());
  const wait=await accountRetryAfter(db,key);
  if(wait)return Response.json({error:`로그인 실패가 반복됐습니다. ${wait}초 후 다시 시도해 주세요.`},
    {status:429,headers:{'Cache-Control':'no-store','Retry-After':String(wait)}});
  if(!await allowLogin(request))throw new ApiError('로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.',429);
  const account=await getAccount();
  const member=account?await db.prepare('SELECT id,salt,password_hash,version,active FROM site_members WHERE owner=? AND username=? COLLATE NOCASE').bind(account.owner,input.username).first<{id:string;salt:string;password_hash:string;version:number;active:number}>():null;
  const hash=await passwordHash(input.password,member?.salt||account?.salt||'unconfigured-account');
  if(!account||!equalHash(hash,member?.password_hash||account.password_hash)||(member?!member.active:input.username!==account.username)){
    await recordAccountFailure(db,key);
    throw new ApiError('아이디 또는 비밀번호를 확인해 주세요.',401);
  }
  const token=await issueSession(account.version,member?.id||null,member?.version||1);
  await clearAccountFailures(db,key);
  return Response.json({ok:true},{headers:sessionHeaders(token)});
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{
  checkOrigin(request);await revokeSession(request);
  return Response.json({ok:true},{headers:sessionHeaders(null)});
}catch(e){return failure(e);}}
