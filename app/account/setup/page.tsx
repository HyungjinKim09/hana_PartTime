import {getAccount,setupOwner} from '@/lib/site-auth';
import {chatGPTSignInPath} from '@/app/chatgpt-auth';
import LoginForm from '@/app/login-form';
export const dynamic='force-dynamic';
export default async function AccountSetup(){
  const owner=await setupOwner();
  if(!owner)return <main className="signin"><div className="brand-mark">F</div><h1>관리자 확인</h1><p>공용 계정 설정은 사이트를 만든 관리자만 할 수 있습니다.</p><a className="primary-button" href={chatGPTSignInPath('/account/setup')} target="_top">관리자 ChatGPT 계정으로 확인</a><a href="/">일반 로그인으로 돌아가기</a></main>;
  const account=await getAccount();
  return <main className="signin"><div className="brand-mark">F</div><h1>공용 계정 {account?'변경':'설정'}</h1><p>팀에서 함께 사용할 아이디와 비밀번호를 설정해 주세요.<br/>기존 일정과 사진을 그대로 함께 사용합니다.</p><LoginForm setup username={account?.username}/><a href="/">보관함으로 돌아가기</a></main>;
}
