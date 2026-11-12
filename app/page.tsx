import {env} from 'cloudflare:workers';
import Workspace from './workspace';
import {sessionUser} from '@/lib/site-auth';
import LoginForm from './login-form';
import {IdentityBoundary} from './identity-boundary';
import {AccountShell} from './account-shell';
export const dynamic='force-dynamic';
export default async function Home(){
  const user=await sessionUser();
  if(!user) return <AccountShell title="로그인" description="관리자에게 받은 개인 계정으로 로그인해 주세요." link={<a href="/account/setup">관리자 계정 설정</a>}>
    <LoginForm turnstileSiteKey={env.TURNSTILE_SITE_KEY}/>
  </AccountShell>;
  const scope=user.memberId?user.owner+'/'+user.memberId:user.owner;
  return <IdentityBoundary scope={scope}><Workspace userName={user.displayName} storageScope={scope} isAdmin={user.isAdmin}/></IdentityBoundary>;
}
