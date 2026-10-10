import {env} from 'cloudflare:workers';
import {refreshSession,sessionHeaders} from '@/lib/refresh-sessions';
import {failure,storage} from '@/lib/storage';
import {checkOrigin} from '../route';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  checkOrigin(request);
  const pair=await refreshSession(storage().db,request.headers.get('cookie')||'',env.ADMIN_SETUP_KEY);
  if(!pair)return Response.json({error:'로그인이 만료되었습니다. 다시 로그인해 주세요.'},{status:401,headers:{'Cache-Control':'no-store'}});
  return Response.json({ok:true},{headers:sessionHeaders(pair)});
}catch(error){return failure(error);}}
