import {env} from 'cloudflare:workers';
import Workspace from './workspace';
import {sessionUser} from '@/lib/site-auth';
import LoginForm from './login-form';
import {IdentityBoundary} from './identity-boundary';
export const dynamic='force-dynamic';
export default async function Home(){
  const user=await sessionUser();
  if(!user) return <main className="signin"><div className="brand-mark">H</div><p className="eyebrow">HANA</p><h1>현장조사 보관함</h1><p>관리자에게 받은 개인 계정으로 로그인해 주세요.</p><LoginForm turnstileSiteKey={env.TURNSTILE_SITE_KEY}/><a href="/account/setup">관리자 계정 설정</a></main>;
  const scope=user.memberId?user.owner+'/'+user.memberId:user.owner;
  return <IdentityBoundary scope={scope}><Workspace userName={user.displayName} storageScope={scope} isAdmin={user.isAdmin}/></IdentityBoundary>;
}
