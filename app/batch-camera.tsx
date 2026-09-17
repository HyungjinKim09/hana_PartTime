"use client";
import {useEffect,useRef,useState} from 'react';
import {Camera,CloudUpload,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
type Capture={id:string;file:File;url:string};
export function BatchCamera({disabled,progress,onUpload,onPendingChange}:{disabled:boolean;progress:{done:number;total:number};onUpload:(files:File[])=>Promise<File[]>;onPendingChange:(pending:boolean)=>void}){
  const [shots,setShots]=useState<Capture[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),current=useRef<Capture[]>([]),uploadLock=useRef(false);
  function update(next:Capture[]){current.current=next;setShots(next);onPendingChange(next.length>0);}
  useEffect(()=>()=>{for(const shot of current.current)URL.revokeObjectURL(shot.url);onPendingChange(false);},[onPendingChange]);
  function collect(files:File[]){
    const accepted=files.filter(file=>file.size>0&&file.size<=20*1024*1024);
    setError(accepted.length===files.length?'':'한 장당 20MB 이하의 사진만 담을 수 있습니다.');
    update([...current.current,...accepted.map(file=>({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)}))]);setOpen(true);
  }
  function remove(id:string){const shot=current.current.find(s=>s.id===id);if(shot)URL.revokeObjectURL(shot.url);update(current.current.filter(s=>s.id!==id));}
  async function save(){
    if(uploadLock.current||disabled||!current.current.length)return;uploadLock.current=true;setBusy(true);setError('');
    const batch=current.current;
    try{
      const failed=await onUpload(batch.map(s=>s.file));const failures=new Set(failed);
      for(const shot of batch)if(!failures.has(shot.file))URL.revokeObjectURL(shot.url);
      const remaining=batch.filter(shot=>failures.has(shot.file));update(remaining);
      if(remaining.length)setError(`${remaining.length}장을 올리지 못했습니다. 아래 사진만 다시 업로드해 주세요.`);else setOpen(false);
    }catch{setError('업로드를 완료하지 못했습니다. 사진을 확인하고 다시 시도해 주세요.');}
    finally{uploadLock.current=false;setBusy(false);}
  }
  return <>
    <button className="secondary-button camera-button" disabled={disabled||busy} onClick={()=>shots.length?setOpen(true):input.current?.click()}><Camera size={17}/>{shots.length?`촬영 사진 ${shots.length}장`:'촬영'}</button>
    <input ref={input} data-capture-queue type="file" accept="image/*" capture="environment" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)collect(files);}}/>
    <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="capture-dialog" onInteractOutside={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle>촬영 사진 모아보기 · {shots.length}장</DialogTitle><DialogDescription>추가 촬영으로 사진을 모은 뒤 한 번에 업로드하세요. 아직 올리지 않은 사진은 이 화면에만 임시 보관됩니다.</DialogDescription></DialogHeader>
      {error&&<p role="alert" className="error-banner">{error}</p>}
      <div className="capture-grid">{shots.map((shot,index)=><figure key={shot.id}><img src={shot.url} alt={`촬영 사진 ${index+1}`} loading="lazy"/><figcaption>{index+1}. {shot.file.name}</figcaption><button className="subtle-button" disabled={busy} aria-label={`촬영 사진 ${index+1} 빼기`} onClick={()=>remove(shot.id)}><Trash2 size={16}/>빼기</button></figure>)}</div>
      {busy&&<div role="status"><Progress value={progress.total?progress.done/progress.total*100:0}/><p>{progress.done} / {progress.total}장 업로드 중…</p></div>}
      <div className="capture-actions"><button className="secondary-button" disabled={busy||disabled} onClick={()=>input.current?.click()}><Camera size={17}/>추가 촬영</button><button className="primary-button" disabled={busy||disabled||!shots.length} onClick={()=>void save()}><CloudUpload size={17}/>{busy?'업로드 중…':`${shots.length}장 업로드`}</button></div>
    </DialogContent></Dialog>
  </>;
}
