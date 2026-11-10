"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine} from 'lucide-react';
import {toast} from 'sonner';
import {downloadArchive} from '@/lib/download-archive';
import {Progress} from '@/components/ui/progress';
export function ArchiveDownload({query,name,folderCounts,onComplete,onStatusChanged}:{query:URLSearchParams;name:string;folderCounts:{total:number;withPhotos:number};onComplete:()=>void;onStatusChanged?:(ids:string[])=>Promise<void>}){
  const [photosOnly,setPhotosOnly]=useState(true);
  const [completed,setCompleted]=useState(false);
  const [receipts,setReceipts]=useState<string[]>([]),[markPrompt,setMarkPrompt]=useState(false),[markBusy,setMarkBusy]=useState(false),[markMessage,setMarkMessage]=useState('');
  const [parts,setParts]=useState<{snapshot:string;parts:{index:number;bytes:number;files:number}[]}|null>(null),[savedParts,setSavedParts]=useState<number[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState({bytes:0,total:0});
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
  function archiveQuery(){const params=new URLSearchParams(query);params.set('photosOnly',photosOnly?'1':'0');params.set('track','1');return params;}
  function changePhotosOnly(value:boolean){if(controller.current||markBusy)return;setPhotosOnly(value);setParts(null);setSavedParts([]);setReceipts([]);setMarkPrompt(false);setMarkMessage('');setCompleted(false);setError('');}
  async function start(part?:number){
    if(controller.current||markBusy)return;
    const task=new AbortController();controller.current=task;setBusy(true);setError('');setMarkPrompt(false);setProgress({bytes:0,total:0});
    let last=0;
    try{
      const params=archiveQuery();if(part!==undefined&&parts){params.set('part',String(part));params.set('snapshot',parts.snapshot);}
      const result=await downloadArchive(params,task.signal,(bytes,total)=>{if(bytes===0||bytes===total||Date.now()-last>100){last=Date.now();setProgress({bytes,total});}},part===undefined?name:`${name}_${part+1}of${parts?.parts.length}`);
      if(part!==undefined)setSavedParts(old=>old.includes(part)?old:[...old,part]);
      setCompleted(true);
      if(result.receipts.length){setReceipts(old=>part===undefined?result.receipts:[...new Set([...old,...result.receipts])]);setMarkPrompt(true);setMarkMessage('');}
      toast.success(result.result==='saved'?'ZIP 파일을 저장했습니다.':'ZIP 준비가 완료됐습니다. 브라우저 다운로드 목록에서 저장을 확인해 주세요.');
    }catch(e){if(e instanceof Error&&e.name==='AbortError')setError('다운로드를 취소했습니다.');else setError(e instanceof Error?e.message:'다운로드하지 못했습니다. 다시 시도해 주세요.');}
    finally{controller.current=null;setBusy(false);onComplete();}
  }
  async function confirmCompletion(){if(markBusy||busy||!receipts.length)return;setMarkBusy(true);setError('');try{const r=await fetch('/api/folder-downloads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipts})}),data=await r.json() as {marked:number;skipped:number;ids:string[];error?:string};if(!r.ok)throw Error(data.error);setMarkPrompt(false);setMarkMessage(`${data.marked}개 일정 폴더를 사진 다운로드 완료로 표시했습니다.${data.skipped?` ${data.skipped}개는 사진이 변경됐거나 다른 분할 파일이 필요해 표시하지 않았습니다.`:''}`);await onStatusChanged?.(data.ids);}catch(e){setError(e instanceof Error?e.message:'완료 표시를 저장하지 못했습니다.');}finally{setMarkBusy(false);}}
  async function inspectParts(){if(controller.current||markBusy)return;const task=new AbortController();controller.current=task;setBusy(true);setError('');try{const params=archiveQuery();params.set('parts','1');const response=await fetch('/api/export?'+params,{method:'POST',signal:task.signal});const data=await response.json() as NonNullable<typeof parts>&{error?:string};if(!response.ok)throw Error(data.error);setParts(data);setSavedParts([]);setReceipts([]);setMarkPrompt(false);setMarkMessage('');}catch(e){setError(e instanceof Error?e.message:'분할 목록을 읽지 못했습니다.');}finally{controller.current=null;setBusy(false);}}
  return <div>
    <p>현장에서 찍은 사진만 다운로드합니다. 도면·비지오·일정표 원본은 포함하지 않습니다.</p>
    <label className="my-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="checkbox" checked={photosOnly} disabled={busy||markBusy} onChange={event=>changePhotosOnly(event.target.checked)} className="mt-1 size-5 shrink-0 accent-blue-700"/>
      <span className="min-w-0 text-sm"><strong className="block">사진이 있는 폴더만 포함</strong><span className="block text-slate-600">{photosOnly?`${folderCounts.withPhotos}개 일정 폴더 포함 · ${folderCounts.total-folderCounts.withPhotos}개 제외`:`전체 ${folderCounts.total}개 일정 폴더 포함`}</span></span>
    </label>
    <button className="primary-button full-width" disabled={busy||markBusy} onClick={()=>void start()}><ArrowDownToLine size={18}/>{busy?'ZIP 다운로드 중…':completed?'다시 다운로드':'ZIP 다운로드'}</button>
    <button className="secondary-button full-width" disabled={busy||markBusy} onClick={()=>void inspectParts()}>200MB씩 나눠 받기{parts?' 목록 갱신':''}</button>
    {parts&&<div className="max-h-48 overflow-y-auto space-y-2 py-3">{parts.parts.map(p=><button key={p.index} disabled={busy||markBusy} className="secondary-button full-width" onClick={()=>void start(p.index)}>{p.index+1}/{parts.parts.length} · {p.files}장 · {(p.bytes/1024/1024).toFixed(1)}MB{savedParts.includes(p.index)?' · 다운로드 완료':''}</button>)}</div>}
    {busy&&<div role="status"><Progress value={progress.total?100*progress.bytes/progress.total:0}/><p>{progress.total?`${(progress.bytes/1024/1024).toFixed(1)} / ${(progress.total/1024/1024).toFixed(1)} MB`:'다운로드를 준비하고 있습니다.'}</p><p>완료될 때까지 이 화면을 열어 두세요.</p><button className="secondary-button" onClick={()=>controller.current?.abort()}>취소</button></div>}
    {markPrompt&&<div className="archive-completion-choice"><strong>이 사진을 다운로드 완료로 표시할까요?</strong><p>파일이 기기에 저장됐는지 확인한 뒤 선택하세요. 팀 전체에 확인한 사람과 시간이 표시됩니다.</p><div className="folder-operations-actions"><button className="primary-button" disabled={busy||markBusy} onClick={()=>void confirmCompletion()}>{markBusy?'표시 저장 중…':'완료로 표시'}</button><button className="secondary-button" disabled={busy||markBusy} onClick={()=>{setMarkPrompt(false);setMarkMessage('완료 상태를 변경하지 않았습니다.');}}>표시하지 않음</button></div></div>}
    {markMessage&&<p className="archive-completion-message" role="status">{markMessage}</p>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
  </div>;
}
