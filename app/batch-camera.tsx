"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Camera,CloudUpload,Images,Settings,Trash2,X} from 'lucide-react';
import {Dialog,DialogClose,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {preferredCamera,quickRearLenses} from '@/lib/camera-lenses';
import {savePending,deletePending} from '@/lib/pending-uploads';
import {uploadId} from '@/lib/upload-id';
import {drawCameraCaptureLeft} from '@/lib/camera-frame';
type Capture={id:string;file:File;url:string};
export function BatchCamera({owner,folder,kind,disabled,progress,onUpload,onCancelUpload,onPendingChange}:{owner:string;folder:string;kind:'photo'|'drawing';disabled:boolean;progress:{done:number;total:number};onUpload:(files:File[])=>Promise<File[]>;onCancelUpload:()=>void;onPendingChange:(pending:boolean)=>void}){
  const [shots,setShots]=useState<Capture[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [panel,setPanel]=useState<'photos'|'settings'|null>(null);
  const input=useRef<HTMLInputElement>(null),current=useRef<Capture[]>([]),uploadLock=useRef(false);
  const trigger=useRef<HTMLButtonElement>(null),photosButton=useRef<HTMLButtonElement>(null),settingsButton=useRef<HTMLButtonElement>(null);
  const panelHeading=useRef<HTMLHeadingElement>(null);
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),generation=useRef(0),captureLock=useRef(false);
  const [camera,setCamera]=useState<'off'|'starting'|'ready'>('off'),[capturing,setCapturing]=useState(false),[cameraError,setCameraError]=useState('');
  const [lenses,setLenses]=useState<MediaDeviceInfo[]>([]),[lensId,setLensId]=useState('');
  const rememberedLens=useRef('');
  const [previewReady,setPreviewReady]=useState(false);
  const quickLenses=quickRearLenses(lenses),lastShot=shots.at(-1);
  const controlsLocked=busy||capturing||disabled;
  useEffect(()=>{if(panel)panelHeading.current?.focus();},[panel]);
  function closePanel(){
    (panel==='photos'?photosButton:settingsButton).current?.focus();
    setPanel(null);
  }
  function updatePreviewReady(){
    const element=video.current;
    setPreviewReady(!!element&&element.readyState>=2&&element.videoWidth>0&&element.videoHeight>0);
  }
  function stopCamera(){
    generation.current++;
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
    if(video.current)video.current.srcObject=null;
    setCamera('off');setPreviewReady(false);
  }
  useEffect(()=>{
    const hide=()=>{if(document.hidden)stopCamera();};
    document.addEventListener('visibilitychange',hide);
    return ()=>{document.removeEventListener('visibilitychange',hide);generation.current++;stream.current?.getTracks().forEach(track=>track.stop());};
  },[]);
  async function startCamera(deviceId?:string){
    stopCamera();setOpen(true);setCameraError('');
    if(!navigator.mediaDevices?.getUserMedia){setCameraError('이 브라우저에서는 연속 촬영을 지원하지 않습니다. 기본 카메라를 이용해 주세요.');return;}
    const request=++generation.current;setCamera('starting');
    try{
      const constraints=(id?:string):MediaStreamConstraints=>({audio:false,video:{...(id?{deviceId:{exact:id}}:{facingMode:{ideal:'environment'}}),width:{ideal:2560},height:{ideal:1920}}});
      let media=await navigator.mediaDevices.getUserMedia(constraints(deviceId));
      if(request!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;
      // Device labels become available after permission. Enumeration failure
      // must not prevent ordinary capture on browsers that restrict this API.
      const devices=await navigator.mediaDevices.enumerateDevices().then(items=>items.filter(item=>item.kind==='videoinput'&&item.deviceId)).catch(()=>[] as MediaDeviceInfo[]);
      if(request!==generation.current)return;
      setLenses(devices);
      const preferred=deviceId||preferredCamera(devices,rememberedLens.current);
      if(preferred&&preferred!==media.getVideoTracks()[0]?.getSettings().deviceId){
        media.getTracks().forEach(track=>track.stop());
        try{media=await navigator.mediaDevices.getUserMedia(constraints(preferred));}
        catch{
          if(request!==generation.current)return;
          rememberedLens.current='';
          setCameraError('선택한 렌즈를 열 수 없어 기본 후면 카메라로 돌아왔습니다. 기본 카메라 앱에서 0.6배를 선택할 수도 있습니다.');
          media=await navigator.mediaDevices.getUserMedia(constraints());
        }
        if(request!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
        stream.current=media;
      }
      const selectedId=media.getVideoTracks()[0]?.getSettings().deviceId||'';
      setLensId(selectedId);
      if(deviceId&&selectedId===deviceId)rememberedLens.current=deviceId;
      const element=video.current;
      if(!element)throw new Error('Camera view unavailable');
      element.srcObject=media;await element.play();
      if(request!==generation.current)return;
      setCamera('ready');updatePreviewReady();
      media.getVideoTracks().forEach(track=>{track.onended=()=>{if(request===generation.current){stopCamera();setCameraError('카메라가 중단되었습니다. 다시 켜거나 기본 카메라를 이용해 주세요.');}};});
    }catch{
      if(request!==generation.current)return;
      stopCamera();setCameraError('카메라를 켜지 못했습니다. 브라우저의 카메라 권한을 허용하거나 기본 카메라를 이용해 주세요.');
    }
  }
  async function capture(){
    const element=video.current;
    if(captureLock.current||uploadLock.current||disabled||!previewReady||camera!=='ready'||!element?.videoWidth)return;
    captureLock.current=true;setCapturing(true);const request=generation.current;
    try{
      const canvas=document.createElement('canvas');
      // Only the saved file is rotated. Live video follows the browser camera orientation.
      drawCameraCaptureLeft(canvas,element,element.videoWidth,element.videoHeight);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.95));
      if(request!==generation.current)return;
      if(!blob)throw new Error('Capture failed');
      // This timestamp is created only by the shutter click after canvas encoding.
      // eslint-disable-next-line react-hooks/purity
      await collect([new File([blob],`HANA_${Date.now()}_${crypto.randomUUID().slice(0,8)}.jpg`,{type:'image/jpeg',lastModified:Date.now()})]);
    }catch{if(request===generation.current)setError('사진을 담지 못했습니다. 다시 촬영해 주세요.');}
    finally{captureLock.current=false;setCapturing(false);}
  }
  function update(next:Capture[]){current.current=next;setShots(next);onPendingChange(next.length>0);}
  useEffect(()=>()=>{for(const shot of current.current)URL.revokeObjectURL(shot.url);onPendingChange(false);},[onPendingChange]);
  async function collect(files:File[]){
    const accepted=files.filter(file=>file.size>0&&file.size<=20*1024*1024);
    setError(accepted.length===files.length?'':'한 장당 20MB 이하의 사진만 담을 수 있습니다.');
    try{await savePending(owner,folder,kind,accepted);}catch(e){setError((e instanceof Error?e.message:'기기 임시 보관 실패')+' 이 화면을 닫기 전에 서버로 업로드해 주세요.');}
    update([...current.current,...accepted.map(file=>({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)}))]);
  }
  function remove(id:string){const shot=current.current.find(s=>s.id===id);if(shot){URL.revokeObjectURL(shot.url);void deletePending(owner,uploadId(shot.file)).catch(()=>setError('기기 임시 보관을 정리하지 못했습니다. 미전송 사진 목록을 확인해 주세요.'));}update(current.current.filter(s=>s.id!==id));}
  async function save(){
    if(uploadLock.current||captureLock.current||disabled||!current.current.length)return;uploadLock.current=true;stopCamera();setBusy(true);setPanel(null);setError('');
    const batch=current.current;
    try{
      const failed=await onUpload(batch.map(s=>s.file));const failures=new Set(failed);
      for(const shot of batch)if(!failures.has(shot.file))URL.revokeObjectURL(shot.url);
      const remaining=batch.filter(shot=>failures.has(shot.file));update(remaining);
      if(remaining.length){setError(`${remaining.length}장을 올리지 못했습니다. 남은 사진만 다시 업로드해 주세요.`);setPanel('photos');}else setOpen(false);
    }catch{setError('업로드를 완료하지 못했습니다. 사진을 확인하고 다시 시도해 주세요.');setPanel('photos');}
    finally{uploadLock.current=false;setBusy(false);}
  }
  function openNativeCamera(){stopCamera();setPanel(null);input.current?.click();}
  function changeOpen(value:boolean){
    if(uploadLock.current||captureLock.current)return;
    if(!value){stopCamera();setPanel(null);}
    setOpen(value);
  }
  return <>
    <button ref={trigger} className="secondary-button camera-button" disabled={disabled||busy} onClick={()=>void startCamera()}><Camera size={17}/>{shots.length?`촬영 사진 ${shots.length}장`:'촬영'}</button>
    <input ref={input} data-capture-queue type="file" accept="image/*" capture="environment" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void collect(files);}}/>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="capture-dialog" showCloseButton={false} onInteractOutside={e=>e.preventDefault()}
        onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}
        onEscapeKeyDown={e=>{if(panel){e.preventDefault();closePanel();}}}>
        <div className="capture-view">
          <video className="capture-live-preview" ref={video} autoPlay muted playsInline aria-label="촬영 미리보기" onLoadedData={updatePreviewReady} onPlaying={updatePreviewReady} onResize={updatePreviewReady} onEmptied={()=>setPreviewReady(false)}/>
          <header className="capture-header">
            <DialogClose className="capture-icon-button" aria-label="촬영 닫기" disabled={busy||capturing}><ArrowLeft size={23}/></DialogClose>
            <DialogTitle>{kind==='drawing'?'도면 촬영':'현장 사진'}</DialogTitle>
            <DialogDescription className="sr-only">사진을 여러 장 촬영한 뒤 한 번에 업로드할 수 있습니다.</DialogDescription>
          </header>
          {!panel&&<>
            {!busy&&camera==='off'&&<div className="capture-message">
              {cameraError&&<p role="status">{cameraError}</p>}
              <button className="capture-secondary" disabled={controlsLocked} onClick={()=>void startCamera()}>카메라 켜기</button>
              <button className="capture-secondary" disabled={controlsLocked} onClick={openNativeCamera}>기본 카메라로 촬영</button>
            </div>}
            {!busy&&camera!=='off'&&!previewReady&&<div className="capture-message" role="status">카메라 준비 중…</div>}
            {camera==='ready'&&quickLenses.length>0&&<div className="capture-lenses" role="group" aria-label="후면 렌즈">
              {quickLenses.map(lens=><button key={lens.deviceId} aria-pressed={lens.deviceId===lensId} disabled={controlsLocked}
                onClick={()=>{if(lens.deviceId!==lensId)void startCamera(lens.deviceId);}}>{lens.label}</button>)}
            </div>}
            {camera==='ready'&&cameraError&&<p className="capture-notice" role="status">{cameraError}</p>}
          </>}
          {error&&!panel&&<p className="capture-notice capture-error" role="alert">{error}</p>}
          {busy&&<div className="capture-message" role="status">
            <p>{progress.done} / {progress.total||shots.length}장 업로드 중…</p>
            <Progress value={progress.total?progress.done/progress.total*100:0}/>
            <button className="capture-secondary" onClick={onCancelUpload}>전송 중단</button>
          </div>}
          {panel&&<section className="capture-panel" aria-labelledby="capture-panel-heading">
            <div className="capture-panel-header">
              <h2 ref={panelHeading} id="capture-panel-heading" tabIndex={-1}>{panel==='photos'?`촬영한 사진 ${shots.length}장`:'촬영 설정'}</h2>
              <button className="capture-icon-button" aria-label="촬영 화면으로 돌아가기" onClick={closePanel}><X size={21}/></button>
            </div>
            {error&&<p className="capture-panel-error capture-error" role="alert">{error}</p>}
            {panel==='photos'?<>
              <p className="capture-panel-note">업로드 전 사진은 이 기기에 임시 보관됩니다.</p>
              {shots.length===0&&<p>담긴 사진이 없습니다.</p>}
              <div className="capture-grid">{shots.map((shot,index)=><figure key={shot.id}>
                <img src={shot.url} alt={`촬영 사진 ${index+1}`} loading="lazy"/>
                <figcaption>{index+1}번 사진 · <a href={shot.url} download={shot.file.name}>원본 보관</a></figcaption>
                <button className="capture-secondary" aria-label={`촬영 사진 ${index+1} 빼기`} onClick={()=>remove(shot.id)}><Trash2 size={16}/>빼기</button>
              </figure>)}</div>
            </>:<div className="capture-settings">
              {lenses.length>1&&<label>촬영 렌즈 <select value={lensId} disabled={controlsLocked||camera==='starting'} onChange={e=>void startCamera(e.target.value)}>
                <option value="" disabled>렌즈 선택</option>
                {lenses.map((lens,index)=><option key={lens.deviceId} value={lens.deviceId}>{lens.label||`카메라 ${index+1}`}</option>)}
              </select></label>}
              {cameraError&&<p role="status">{cameraError}</p>}
              <button className="capture-secondary" disabled={controlsLocked} onClick={openNativeCamera}><Camera size={17}/>기본 카메라로 촬영</button>
            </div>}
          </section>}
        </div>
        <div className="capture-controls">
          <button className="capture-upload" disabled={controlsLocked||!shots.length} onClick={()=>void save()}>
            <CloudUpload size={18}/>{busy?'업로드 중…':`${shots.length}장 업로드`}
          </button>
          <button className="capture-shutter" aria-label="사진 촬영" disabled={controlsLocked||!!panel||camera!=='ready'||!previewReady} onClick={()=>void capture()}/>
          <div className="capture-tools">
            <button ref={photosButton} className="capture-photos" aria-label={`촬영한 사진 ${shots.length}장 보기`} aria-expanded={panel==='photos'} disabled={controlsLocked||!lastShot}
              onClick={()=>panel==='photos'?closePanel():setPanel('photos')}>
              {lastShot?<img src={lastShot.url} alt=""/>:<span className="capture-empty-thumb"><Images size={20}/></span>}
              <span>{shots.length}장 담김</span>
            </button>
            <button ref={settingsButton} className="capture-icon-button" aria-label="촬영 설정" aria-expanded={panel==='settings'} disabled={controlsLocked}
              onClick={()=>panel==='settings'?closePanel():setPanel('settings')}><Settings size={22}/></button>
          </div>
          <span className="sr-only" role="status" aria-live="polite">{capturing?'사진 담는 중':`${shots.length}장 담김`}</span>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
