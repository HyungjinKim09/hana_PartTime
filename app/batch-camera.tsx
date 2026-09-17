"use client";
import {useEffect,useRef,useState} from 'react';
import {Camera,CloudUpload,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
type Capture={id:string;file:File;url:string};
export function BatchCamera({disabled,progress,onUpload,onPendingChange}:{disabled:boolean;progress:{done:number;total:number};onUpload:(files:File[])=>Promise<File[]>;onPendingChange:(pending:boolean)=>void}){
  const [shots,setShots]=useState<Capture[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),current=useRef<Capture[]>([]),uploadLock=useRef(false);
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),generation=useRef(0),captureLock=useRef(false);
  const [camera,setCamera]=useState<'off'|'starting'|'ready'>('off'),[capturing,setCapturing]=useState(false),[cameraError,setCameraError]=useState('');
  function stopCamera(){
    generation.current++;
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
    if(video.current)video.current.srcObject=null;
    setCamera('off');
  }
  useEffect(()=>{
    const hide=()=>{if(document.hidden)stopCamera();};
    document.addEventListener('visibilitychange',hide);
    return ()=>{document.removeEventListener('visibilitychange',hide);generation.current++;stream.current?.getTracks().forEach(track=>track.stop());};
  },[]);
  async function startCamera(){
    stopCamera();setOpen(true);setCameraError('');
    if(!navigator.mediaDevices?.getUserMedia){setCameraError('이 브라우저에서는 연속 촬영을 지원하지 않습니다. 기본 카메라를 이용해 주세요.');return;}
    const request=++generation.current;setCamera('starting');
    try{
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});
      if(request!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;
      const element=video.current;
      if(!element)throw new Error('Camera view unavailable');
      element.srcObject=media;await element.play();
      if(request!==generation.current)return;
      setCamera('ready');
      media.getVideoTracks().forEach(track=>{track.onended=()=>{if(request===generation.current){stopCamera();setCameraError('카메라가 중단되었습니다. 다시 켜거나 기본 카메라를 이용해 주세요.');}};});
    }catch{
      if(request!==generation.current)return;
      stopCamera();setCameraError('카메라를 켜지 못했습니다. 브라우저의 카메라 권한을 허용하거나 기본 카메라를 이용해 주세요.');
    }
  }
  async function capture(){
    const element=video.current;
    if(captureLock.current||uploadLock.current||disabled||camera!=='ready'||!element?.videoWidth)return;
    captureLock.current=true;setCapturing(true);const request=generation.current;
    try{
      const canvas=document.createElement('canvas');canvas.width=element.videoWidth;canvas.height=element.videoHeight;
      const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
      context.drawImage(element,0,0);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.95));
      if(request!==generation.current)return;
      if(!blob)throw new Error('Capture failed');
      collect([new File([blob],`HANA_${Date.now()}_${crypto.randomUUID().slice(0,8)}.jpg`,{type:'image/jpeg',lastModified:Date.now()})]);
    }catch{if(request===generation.current)setError('사진을 담지 못했습니다. 다시 촬영해 주세요.');}
    finally{captureLock.current=false;setCapturing(false);}
  }
  function update(next:Capture[]){current.current=next;setShots(next);onPendingChange(next.length>0);}
  useEffect(()=>()=>{for(const shot of current.current)URL.revokeObjectURL(shot.url);onPendingChange(false);},[onPendingChange]);
  function collect(files:File[]){
    const accepted=files.filter(file=>file.size>0&&file.size<=20*1024*1024);
    setError(accepted.length===files.length?'':'한 장당 20MB 이하의 사진만 담을 수 있습니다.');
    update([...current.current,...accepted.map(file=>({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)}))]);setOpen(true);
  }
  function remove(id:string){const shot=current.current.find(s=>s.id===id);if(shot)URL.revokeObjectURL(shot.url);update(current.current.filter(s=>s.id!==id));}
  async function save(){
    if(uploadLock.current||captureLock.current||disabled||!current.current.length)return;uploadLock.current=true;stopCamera();setBusy(true);setError('');
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
    <button className="secondary-button camera-button" disabled={disabled||busy} onClick={()=>shots.length?setOpen(true):void startCamera()}><Camera size={17}/>{shots.length?`촬영 사진 ${shots.length}장`:'촬영'}</button>
    <input ref={input} data-capture-queue type="file" accept="image/*" capture="environment" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)collect(files);}}/>
    <Dialog open={open} onOpenChange={value=>{if(!busy){if(!value)stopCamera();setOpen(value);}}}><DialogContent className="capture-dialog" onInteractOutside={e=>e.preventDefault()}><DialogHeader><DialogTitle>연속 촬영 · {shots.length}장</DialogTitle><DialogDescription>촬영 버튼을 눌러 여러 장을 담고 한 번에 업로드하세요. 업로드 전 사진은 이 화면에만 임시 보관됩니다.</DialogDescription></DialogHeader>
      <div className="capture-view" hidden={camera==='off'}><video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기"/>{camera==='starting'&&<p role="status">카메라를 켜는 중…</p>}</div>
      {cameraError&&<p role="status" className="error-banner">{cameraError}</p>}
      <div className="capture-camera-controls">
        {camera==='ready'?<><button className="primary-button capture-shutter" disabled={capturing||busy||disabled} onClick={()=>void capture()}><Camera size={24}/>{capturing?'사진 담는 중…':'사진 촬영'}</button><button className="subtle-button" onClick={stopCamera}>카메라 끄기</button></>:<button className="secondary-button" disabled={camera==='starting'||busy||disabled} onClick={()=>void startCamera()}>연속 촬영 켜기</button>}
        <span role="status" aria-live="polite">{shots.length}장 담김</span>
      </div>
      {error&&<p role="alert" className="error-banner">{error}</p>}
      <div className="capture-grid capture-strip">{shots.map((shot,index)=><figure key={shot.id}><img src={shot.url} alt={`촬영 사진 ${index+1}`} loading="lazy"/><figcaption>{index+1}번 사진</figcaption><button className="subtle-button" disabled={busy} aria-label={`촬영 사진 ${index+1} 빼기`} onClick={()=>remove(shot.id)}><Trash2 size={16}/>빼기</button></figure>)}</div>
      {busy&&<div role="status"><Progress value={progress.total?progress.done/progress.total*100:0}/><p>{progress.done} / {progress.total}장 업로드 중…</p></div>}
      <div className="capture-actions"><button className="secondary-button" disabled={busy||disabled||capturing} onClick={()=>{stopCamera();input.current?.click();}}><Camera size={17}/>기본 카메라로 촬영</button><button className="primary-button" disabled={busy||disabled||capturing||!shots.length} onClick={()=>void save()}><CloudUpload size={17}/>{busy?'업로드 중…':`${shots.length}장 업로드`}</button></div>
    </DialogContent></Dialog>
  </>;
}
