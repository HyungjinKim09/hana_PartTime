"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine} from 'lucide-react';
import {toast} from 'sonner';
import {downloadArchive} from '@/lib/download-archive';
import {Progress} from '@/components/ui/progress';
export function ArchiveDownload({query,name,folderCounts,onComplete}:{query:URLSearchParams;name:string;folderCounts:{total:number;withPhotos:number};onComplete:()=>void}){
  const [photosOnly,setPhotosOnly]=useState(true);
  const [completed,setCompleted]=useState(false);
  const [parts,setParts]=useState<{snapshot:string;parts:{index:number;bytes:number;files:number}[]}|null>(null),[savedParts,setSavedParts]=useState<number[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState({bytes:0,total:0});
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
  function archiveQuery(){const params=new URLSearchParams(query);params.set('photosOnly',photosOnly?'1':'0');return params;}
  function changePhotosOnly(value:boolean){if(controller.current)return;setPhotosOnly(value);setParts(null);setSavedParts([]);setCompleted(false);setError('');}
  async function start(part?:number){
    if(controller.current)return;
    const task=new AbortController();controller.current=task;setBusy(true);setError('');setProgress({bytes:0,total:0});
    let last=0;
    try{
      const params=archiveQuery();if(part!==undefined&&parts){params.set('part',String(part));params.set('snapshot',parts.snapshot);}
      const result=await downloadArchive(params,task.signal,(bytes,total)=>{if(bytes===0||bytes===total||Date.now()-last>100){last=Date.now();setProgress({bytes,total});}},part===undefined?name:`${name}_${part+1}of${parts?.parts.length}`);
      if(part!==undefined)setSavedParts(old=>old.includes(part)?old:[...old,part]);
      setCompleted(true);
      toast.success(result==='saved'?'ZIP 파일을 저장했습니다.':'ZIP 준비가 완료됐습니다. 브라우저 다운로드 목록에서 저장을 확인해 주세요.');
    }catch(e){if(e instanceof Error&&e.name==='AbortError')setError('다운로드를 취소했습니다.');else setError(e instanceof Error?e.message:'다운로드하지 못했습니다. 다시 시도해 주세요.');}
    finally{controller.current=null;setBusy(false);onComplete();}
  }
  async function inspectParts(){if(controller.current)return;const task=new AbortController();controller.current=task;setBusy(true);setError('');try{const params=archiveQuery();params.set('parts','1');const response=await fetch('/api/export?'+params,{method:'POST',signal:task.signal});const data=await response.json() as NonNullable<typeof parts>&{error?:string};if(!response.ok)throw Error(data.error);setParts(data);setSavedParts([]);}catch(e){setError(e instanceof Error?e.message:'분할 목록을 읽지 못했습니다.');}finally{controller.current=null;setBusy(false);}}
  return <div>
    <p>현장에서 찍은 사진만 다운로드합니다. 도면·비지오·일정표 원본은 포함하지 않습니다.</p>
    <label className="my-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="checkbox" checked={photosOnly} disabled={busy} onChange={event=>changePhotosOnly(event.target.checked)} className="mt-1 size-5 shrink-0 accent-blue-700"/>
      <span className="min-w-0 text-sm"><strong className="block">사진이 있는 폴더만 포함</strong><span className="block text-slate-600">{photosOnly?`${folderCounts.withPhotos}개 일정 폴더 포함 · ${folderCounts.total-folderCounts.withPhotos}개 제외`:`전체 ${folderCounts.total}개 일정 폴더 포함`}</span></span>
    </label>
    <button className="primary-button full-width" disabled={busy} onClick={()=>void start()}><ArrowDownToLine size={18}/>{busy?'ZIP 다운로드 중…':completed?'다시 다운로드':'ZIP 다운로드'}</button>
    <button className="secondary-button full-width" disabled={busy} onClick={()=>void inspectParts()}>200MB씩 나눠 받기{parts?' 목록 갱신':''}</button>
    {parts&&<div className="max-h-48 overflow-y-auto space-y-2 py-3">{parts.parts.map(p=><button key={p.index} disabled={busy} className="secondary-button full-width" onClick={()=>void start(p.index)}>{p.index+1}/{parts.parts.length} · {p.files}장 · {(p.bytes/1024/1024).toFixed(1)}MB{savedParts.includes(p.index)?' · 다운로드 완료':''}</button>)}</div>}
    {busy&&<div role="status"><Progress value={progress.total?100*progress.bytes/progress.total:0}/><p>{progress.total?`${(progress.bytes/1024/1024).toFixed(1)} / ${(progress.total/1024/1024).toFixed(1)} MB`:'다운로드를 준비하고 있습니다.'}</p><p>완료될 때까지 이 화면을 열어 두세요.</p><button className="secondary-button" onClick={()=>controller.current?.abort()}>취소</button></div>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
  </div>;
}
