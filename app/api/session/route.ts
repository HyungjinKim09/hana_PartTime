import {z} from 'zod';
import {ApiError,failure,limitedBody} from '@/lib/storage';
import {allowLogin,equalHash,getAccount,issueSession,passwordHash,revokeSession,sessionCookie} from '@/lib/site-auth';
export const dynamic='force-dynamic';
export function checkOrigin(request:Request){
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('이 사이트의 로그인 화면에서 다시 시도해 주세요.',403);
}
export const credentials=z.object({username:z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/),password:z.string().min(12).max(128)}).strict();
export async function readCredentials(request:Request){
  try{return credentials.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,2048))));}catch{throw new ApiError('아이디는 영문·숫자 등 3~40자, 비밀번호는 12~128자로 입력해 주세요.');}
}
export async function POST(request:Request){try{
  checkOrigin(request);if(!await allowLogin(request))throw new ApiError('로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.',429);
  const input=await readCredentials(request),account=await getAccount();
  const hash=await passwordHash(input.password,account?.salt||'unconfigured-account');
  if(!account||!equalHash(hash,account.password_hash)||input.username!==account.username)throw new ApiError('아이디 또는 비밀번호를 확인해 주세요.',401);
  const token=await issueSession(account.version);
  return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(token),'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{
  checkOrigin(request);await revokeSession(request);
  return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie('',0),'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
