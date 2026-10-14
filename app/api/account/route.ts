import {ApiError,failure,storage} from '@/lib/storage';
import {getAccount,issueSession,passwordHash,randomToken,sessionHeaders,validAdminKey,allowLogin,sessionUser} from '@/lib/site-auth';
import {env} from 'cloudflare:workers';
import {checkOrigin,readCredentials} from '../session/route';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  checkOrigin(request);const current=await sessionUser();if(current&&!current.isAdmin)throw new ApiError('관리자 계정으로 로그인해 주세요.',403);
  if(!await allowLogin(request,'admin'))throw new ApiError('시도가 많습니다. 15분 후 다시 시도해 주세요.',429);
  if(!await validAdminKey(request.headers.get('x-admin-key')||''))throw new ApiError('관리 키를 확인해 주세요. 관리자만 공용 계정을 설정할 수 있습니다.',403);
  const input=await readCredentials(request),{db}=storage();const account=await getAccount();
  const owner=account?.owner || env.SITE_DATA_OWNER || 'hanaparttime';
  if(await db.prepare('SELECT id FROM site_members WHERE owner=? AND username=? COLLATE NOCASE').bind(owner,input.username).first())throw new ApiError('개인 계정에서 사용하는 아이디입니다.',409);
  const salt=randomToken(),hash=await passwordHash(input.password,salt);
  const updated=await db.prepare('INSERT INTO site_account (id,owner,username,salt,password_hash,version) VALUES (1,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET username=excluded.username,salt=excluded.salt,password_hash=excluded.password_hash,version=site_account.version+1 RETURNING version').bind(owner,input.username,salt,hash).first<{version:number}>();
  if(!updated)throw new ApiError('계정을 저장하지 못했습니다.',503);
  await db.prepare('DELETE FROM site_sessions WHERE version<>?').bind(updated.version).run();
  await db.prepare('DELETE FROM site_refresh_sessions WHERE version<>?').bind(updated.version).run();
  const token=await issueSession(updated.version);
  return Response.json({ok:true},{headers:sessionHeaders(token)});
}catch(e){return failure(e);}}
