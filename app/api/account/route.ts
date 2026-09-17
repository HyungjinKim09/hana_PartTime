import {ApiError,failure,storage} from '@/lib/storage';
import {getAccount,issueSession,passwordHash,randomToken,sessionCookie,setupOwner} from '@/lib/site-auth';
import {checkOrigin,readCredentials} from '../session/route';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  checkOrigin(request);const owner=await setupOwner();if(!owner)throw new ApiError('관리자만 공용 계정을 설정할 수 있습니다.',403);
  const input=await readCredentials(request),{db}=storage();const account=await getAccount();
  if(account&&account.owner!==owner.userId)throw new ApiError('기존 보관함의 관리자 계정으로 접속해 주세요.',403);
  const salt=randomToken(),hash=await passwordHash(input.password,salt);
  const updated=await db.prepare('INSERT INTO site_account (id,owner,username,salt,password_hash,version) VALUES (1,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET username=excluded.username,salt=excluded.salt,password_hash=excluded.password_hash,version=site_account.version+1 RETURNING version').bind(owner.userId,input.username,salt,hash).first<{version:number}>();
  if(!updated)throw new ApiError('계정을 저장하지 못했습니다.',503);
  await db.prepare('DELETE FROM site_sessions WHERE version<>?').bind(updated.version).run();
  const token=await issueSession(updated.version);
  return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(token),'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
