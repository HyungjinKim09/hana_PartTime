import Link from 'next/link';
import LoginForm from '@/app/login-form';
export const dynamic='force-dynamic';
export default function AccountSetup(){
  return <main className="signin"><div className="brand-mark">H</div><h1>공용 계정 설정</h1><p>관리자만 보관하는 관리 키를 입력해 주세요.<br/>팀에서 사용할 아이디와 비밀번호를 설정하거나 변경할 수 있습니다.</p><LoginForm setup/><Link prefetch={false} href="/">로그인으로 돌아가기</Link></main>;
}
