"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine} from 'lucide-react';
import {toast} from 'sonner';
import {downloadArchive} from '@/lib/download-archive';
import {Progress} from '@/components/ui/progress';
export function ArchiveDownload({query,onComplete}:{query:URLSearchParams;onComplete:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState({bytes:0,total:0});
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
  async function start(){
    if(controller.current)return;
    const task=new AbortController();controller.current=task;setBusy(true);setError('');setProgress({bytes:0,total:0});
    let last=0;
    try{
      const result=await downloadArchive(query,task.signal,(bytes,total)=>{if(bytes===0||bytes===total||Date.now()-last>100){last=Date.now();setProgress({bytes,total});}});
      toast.success(result==='saved'?'ZIP 파일을 저장했습니다.':'ZIP 준비가 완료됐습니다. 브라우저 다운로드 목록에서 저장을 확인해 주세요.');
    }catch(e){if(e instanceof Error&&e.name==='AbortError')setError('다운로드를 취소했습니다.');else setError(e instanceof Error?e.message:'다운로드하지 못했습니다. 다시 시도해 주세요.');}
    finally{controller.current=null;setBusy(false);onComplete();}
  }
  return <div>
    <button className="primary-button full-width" disabled={busy} onClick={()=>void start()}><ArrowDownToLine size={18}/>{busy?'ZIP 다운로드 중…':'ZIP 다운로드'}</button>
    {busy&&<div role="status"><Progress value={progress.total?100*progress.bytes/progress.total:0}/><p>{progress.total?`${(progress.bytes/1024/1024).toFixed(1)} / ${(progress.total/1024/1024).toFixed(1)} MB`:'다운로드를 준비하고 있습니다.'}</p><p>완료될 때까지 이 화면을 열어 두세요.</p><button className="secondary-button" onClick={()=>controller.current?.abort()}>취소</button></div>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
  </div>;
}
