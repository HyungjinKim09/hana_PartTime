import {env} from 'cloudflare:workers';
import {sessionUser} from './site-auth';
export class ApiError extends Error { constructor(message:string,public status=400){super(message);} }
export async function identity(request?:Request) {
  const user=await sessionUser();
  if(!user) throw new ApiError('로그인 후 다시 시도해 주세요.',401);
  if(request && request.method!=='GET') {
    if(request.headers.get('sec-fetch-site')==='cross-site') throw new ApiError('허용되지 않은 요청입니다.',403);
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) throw new ApiError('허용되지 않은 요청입니다.',403);
  }
  return user.owner;
}
export function storage(){
  if(!env.DB || !env.BUCKET) throw new ApiError('사진 보관함에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',503);
  return {db:env.DB,bucket:env.BUCKET};
}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
export function failure(error:unknown){
  if(error instanceof ApiError) return json({error:error.message},error.status);
  console.error('Photo storage operation failed',error instanceof Error?error.message:'Unknown error');
  return json({error:'처리하지 못했습니다. 원본 사진은 기기에 보관하고 잠시 후 다시 시도해 주세요.'},503);
}
export async function limitedBody(request:Request,max:number){
  if(Number(request.headers.get('content-length')||0)>max) throw new ApiError('사진 한 장은 20MB 이하여야 합니다.',413);
  if(!request.body) throw new ApiError('사진 파일이 없습니다.');
  const reader=request.body.getReader(); const parts:Uint8Array[]=[]; let length=0;
  try { for(;;){const {value,done}=await reader.read(); if(done) break; length+=value.length;
    if(length>max){await reader.cancel();throw new ApiError('사진 한 장은 20MB 이하여야 합니다.',413);} parts.push(value);
  }} finally {reader.releaseLock();}
  if(length===0) throw new ApiError('빈 파일은 올릴 수 없습니다.');
  const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
export function imageType(bytes:Uint8Array):string {
  if(bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  const start=new TextDecoder().decode(bytes.slice(0,32));
  if(start.startsWith('RIFF') && start.slice(8,12)==='WEBP') return 'image/webp';
  if(start.startsWith('GIF87a') || start.startsWith('GIF89a')) return 'image/gif';
  if(start.slice(4,8)==='ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(start.slice(8))) return 'image/heic';
  throw new ApiError('JPG, PNG, WEBP, GIF, HEIC 사진만 올릴 수 있습니다.',415);
}
