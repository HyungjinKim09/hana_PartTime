"use client";
import {useLayoutEffect,useRef,useState} from 'react';
import {AUTH_CHANGE} from '@/lib/auth-change';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
// The scope is an expected identity, never an authorization credential.
export function IdentityBoundary({scope,children}:{scope:string;children:React.ReactNode}){
 const [state,setState]=useState<'checking'|'ready'|'changed'|'unavailable'>('checking'),retry=useRef<()=>void>(()=>{});
 useLayoutEffect(()=>{document.body.inert=state==='checking';return()=>{document.body.inert=false;};},[state]);
 useLayoutEffect(()=>{
  const original=window.fetch.bind(window);let changed=false,disposed=false,verified=false,check:Promise<void>|undefined,gate:Promise<void>|undefined,release:(()=>void)|undefined;
  const releaseWaiting=()=>{release?.();release=undefined;gate=undefined;};
  const waitForVerification=()=>gate??=new Promise<void>(resolve=>{release=resolve;});
  const invalidate=()=>{changed=true;releaseWaiting();if(!disposed)setState('changed');};
  const validate=()=>{
   if(changed||disposed)return Promise.resolve();if(check)return check;verified=false;setState('checking');
   check=(async()=>{try{const r=await original('/api/identity',{cache:'no-store'});if(r.status===401){invalidate();return;}if(!r.ok)throw Error();const data=await r.json() as {scope?:string};if(data.scope!==scope)invalidate();else if(!changed&&!disposed){verified=true;releaseWaiting();setState('ready');}}catch{if(!changed&&!disposed)setState('unavailable');}finally{check=undefined;}})();return check;
  };
  const fenced:typeof fetch=async(input,init)=>{
   const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
   if(url.origin!==window.location.origin||!url.pathname.startsWith('/api/'))return original(input,init);
   if(check)await check;if(!verified&&!changed&&!disposed)await waitForVerification();if(disposed||init?.signal?.aborted)throw new DOMException('요청을 중단했습니다.','AbortError');if(changed)throw new Error('로그인 계정이 변경되었습니다. 화면을 다시 열어 주세요.');
   const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));headers.set('X-Hana-Identity',scope);
   const response=await original(input,{...init,headers});
   if(response.status===401)invalidate();
   else if(response.status===409){const body=await response.clone().json().catch(()=>null) as {code?:string}|null;if(body?.code==='identity_changed')invalidate();}
   return response;
  };
  window.fetch=fenced;retry.current=()=>{void validate();};
  const resume=()=>{if(document.visibilityState==='visible')void validate();};
  const change=(event:StorageEvent)=>{if(event.key===AUTH_CHANGE)invalidate();};
  window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);window.addEventListener('storage',change);void validate();
  return()=>{disposed=true;releaseWaiting();if(window.fetch===fenced)window.fetch=original;window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('storage',change);};
 },[scope]);
 if(state==='changed')return <main className="signin"><h1>로그인 상태를 다시 확인해 주세요</h1><p>계정이 변경되었거나 로그인을 확인할 수 없습니다. 이전 작업자의 미전송 사진은 이 기기에 그대로 보관됩니다.</p><button className="primary-button" onClick={()=>window.location.reload()}>현재 계정으로 화면 다시 열기</button></main>;
 return <><div hidden={state!=='ready'} inert={state!=='ready'}>{children}</div>{(state==='checking'||state==='unavailable')&&<div className="identity-shield" role="status">{state==='checking'?'로그인 상태 확인 중…':''}</div>}<Dialog open={state==='unavailable'}><DialogContent className="identity-retry-dialog" showCloseButton={false} onEscapeKeyDown={event=>event.preventDefault()} onPointerDownOutside={event=>event.preventDefault()}><DialogHeader><DialogTitle>연결 상태를 확인해 주세요</DialogTitle><DialogDescription>작성 중인 내용은 보존하고 있습니다. 연결이 돌아오면 같은 계정인지 확인한 뒤 작업을 이어갈 수 있습니다.</DialogDescription></DialogHeader><button className="primary-button" onClick={()=>retry.current()}>연결·로그인 다시 확인</button></DialogContent></Dialog></>;
}
