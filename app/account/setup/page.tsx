import Link from 'next/link';
import LoginForm from '@/app/login-form';
import {AccountShell} from '@/app/account-shell';
export const dynamic='force-dynamic';
export default function AccountSetup(){
  return <AccountShell title="관리자 계정 설정" description="관리 키를 입력해 관리자 아이디와 비밀번호를 설정하거나 변경하세요." link={<Link prefetch={false} href="/">로그인으로 돌아가기</Link>}>
    <LoginForm setup/>
  </AccountShell>;
}
