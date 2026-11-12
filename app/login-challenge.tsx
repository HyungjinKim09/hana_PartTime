"use client";
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';

type TurnstileWidget={
  render(element:HTMLElement,options:{
    sitekey:string;action:string;appearance:'interaction-only';
    callback:(token:string)=>void;
    'expired-callback':()=>void;
    'timeout-callback':()=>void;
    'error-callback':()=>void;
  }):string;
  reset(id:string):void;
  remove(id:string):void;
};
function turnstile(){return (window as Window&{turnstile?:TurnstileWidget}).turnstile;}

export function LoginChallenge({siteKey,onToken,reset}:{siteKey:string;onToken:(token:string)=>void;reset:number}){
  const container=useRef<HTMLDivElement>(null);
  const widgetId=useRef<string|null>(null);
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const widget=turnstile();
    if(!ready||!widget||!container.current)return;
    const id=widget.render(container.current,{
      sitekey:siteKey,action:'login',appearance:'interaction-only',
      callback:token=>{setFailed(false);onToken(token);},
      'expired-callback':()=>onToken(''),
      'timeout-callback':()=>onToken(''),
      'error-callback':()=>{onToken('');setFailed(true);},
    });
    widgetId.current=id;
    return ()=>{widget.remove(id);widgetId.current=null;};
  },[ready,siteKey,onToken]);
  useEffect(()=>{
    if(reset&&widgetId.current!==null)turnstile()?.reset(widgetId.current);
  },[reset]);
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={()=>setReady(true)} onError={()=>setFailed(true)}/>
    <div ref={container}/>
    {failed&&<p className="login-error" role="alert">보안 확인을 불러오지 못했습니다. 연결을 확인하고 화면을 다시 열어 주세요.</p>}
  </>;
}
