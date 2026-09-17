"use client";
import {useState} from 'react';
import {Input} from '@/components/ui/input';
export default function LoginForm({setup=false,username=''}:{setup?:boolean;username?:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const data=new FormData(event.currentTarget);setError('');
    if(setup&&data.get('password')!==data.get('confirm')){setError('비밀번호 확인이 일치하지 않습니다.');return;}
    setBusy(true);try{
      const response=await fetch(setup?'/api/account':'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:data.get('username'),password:data.get('password')})});
      const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||'로그인하지 못했습니다.');window.location.assign('/');
    }catch(e){setError(e instanceof Error?e.message:'연결을 확인해 주세요.');setBusy(false);}
  }
  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="username">공용 아이디</label><Input id="username" name="username" defaultValue={username} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={40} pattern="[a-zA-Z0-9_.\-]+" disabled={busy}/>
    {setup&&<small>영문·숫자, 밑줄(_), 점(.), 하이픈(-)으로 3~40자</small>}
    <label htmlFor="password">비밀번호</label><Input id="password" name="password" type="password" autoComplete={setup?'new-password':'current-password'} required minLength={12} maxLength={128} disabled={busy}/>
    {setup&&<><small>12자 이상으로 설정해 주세요. 계정 변경 시 모든 기기에서 다시 로그인해야 합니다.</small><label htmlFor="confirm">비밀번호 확인</label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy}/></>}
    {error&&<p className="login-error" role="alert">{error}</p>}
    <button className="primary-button full-width" disabled={busy} type="submit">{busy?'처리 중…':setup?'공용 계정 저장':'로그인'}</button>
  </form>;
}
