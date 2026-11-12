"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,RotateCcw,RotateCw} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {rotateCanvas,type Rotation} from '@/lib/drawing-image';
import type {Photo} from '@/lib/types';

export function photoUrl(photo:Photo){
 return '/api/photos/'+encodeURIComponent(photo.id)+(photo.version?'?v='+encodeURIComponent(photo.version):'');
}

async function animatedPhoto(blob:Blob){
 if(blob.type==='image/webp'){
  const header=new Uint8Array(await blob.slice(0,21).arrayBuffer());
  return new TextDecoder().decode(header.subarray(12,16))==='VP8X'&&Boolean(header[20]&2);
 }
 if(blob.type!=='image/png')return false;
 const data=new DataView(await blob.arrayBuffer());
 for(let offset=8;offset+12<=data.byteLength;){
  const chunk=data.getUint32(offset+4);
  if(chunk===0x6163544c)return true; // acTL
  if(chunk===0x49444154)return false; // IDAT
  offset+=12+data.getUint32(offset);
 }
 return false;
}

async function encodeRotation(image:HTMLImageElement,rotation:Rotation,type:string){
 const maxBytes=20*1024*1024,canvas=rotateCanvas(image,rotation);
 try{
  for(const quality of type==='image/png'?[undefined]:[0.95,0.88,0.8]){
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,quality));
   if(!blob||blob.type!==type)throw Error('이 브라우저에서 회전한 사진을 저장할 수 없습니다.');
   if(blob.size<=maxBytes)return blob;
  }
  throw Error('회전한 사진이 20MB를 초과합니다.');
 }finally{canvas.width=0;canvas.height=0;}
}

export function PhotoPreview({photo,size,disabled,onClose,onSaved}:{photo:Photo;size:string;disabled:boolean;onClose:()=>void;onSaved:(photo:Photo)=>void}){
 const [source,setSource]=useState<{url:string;tag:string;type:string;animated:boolean}|null>(null);
 const [rotation,setRotation]=useState<Rotation>(0),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const image=useRef<HTMLImageElement>(null);
 const url=photoUrl(photo);
 const editable=photo.kind==='photo'&&['image/jpeg','image/png','image/webp','image/heic'].includes(photo.content_type);

 useEffect(()=>{
  if(!editable)return;
  const controller=new AbortController();
  let objectUrl:string|undefined;
  async function load(){try{
   const response=await fetch(url,{cache:'no-cache',signal:controller.signal});
   const tag=response.headers.get('etag');
   if(!response.ok||!tag)throw Error('저장된 사진을 불러오지 못했습니다.');
   const blob=await response.blob(),animated=await animatedPhoto(blob);
   if(controller.signal.aborted)return;
   objectUrl=URL.createObjectURL(blob);
   setSource({url:objectUrl,tag,type:blob.type,animated});
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'사진을 불러오지 못했습니다.');}}
  void load();
  return ()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[url,editable]);

 async function save(){
  if(!source||source.animated||!image.current||!ready||!rotation||saving||disabled)return;
  setSaving(true);setError('');
  try{
   const blob=await encodeRotation(image.current,rotation,source.type==='image/heic'?'image/jpeg':source.type);
   const response=await fetch(url,{method:'PATCH',headers:{'If-Match':source.tag,'Content-Type':blob.type},body:blob});
   const data=await response.json() as {photo?:Photo;error?:string};
   if(!response.ok||!data.photo)throw Error(data.error||'회전한 사진을 저장하지 못했습니다.');
   onSaved(data.photo);
  }catch(e){setError(e instanceof Error?e.message:'회전한 사진을 저장하지 못했습니다.');}
  finally{setSaving(false);}
 }

 const canRotate=ready&&!source?.animated&&!saving&&!disabled;
 return <Dialog open onOpenChange={open=>{if(!open&&!saving)onClose();}}>
  <DialogContent className="photo-dialog photo-edit-dialog" showCloseButton={!saving}>
   <DialogHeader><DialogTitle>{photo.filename}</DialogTitle><DialogDescription>저장된 사진 · {size}</DialogDescription></DialogHeader>
   {editable?<>
    {source?<div className="photo-rotation-preview" data-sideways={rotation%180!==0}>
     <img ref={image} src={source.url} alt={photo.filename} style={{rotate:rotation+'deg'}} onLoad={()=>setReady(true)} onError={()=>setError(photo.content_type==='image/heic'?'이 브라우저에서는 HEIC를 열 수 없습니다. HEIC를 지원하는 기기에서 회전해 주세요.':'사진을 열 수 없습니다.')}/>
    </div>:!error&&<p role="status">사진을 불러오는 중…</p>}
    {source?.animated?<p>움직이는 사진은 회전 저장을 지원하지 않습니다.</p>:<div className="photo-rotation-actions">
     <button className="secondary-button" disabled={!canRotate} onClick={()=>setRotation(value=>((value+270)%360) as Rotation)}><RotateCcw size={16}/>왼쪽 90°</button>
     <button className="secondary-button" disabled={!canRotate} onClick={()=>setRotation(value=>((value+90)%360) as Rotation)}><RotateCw size={16}/>오른쪽 90°</button>
     <button className="primary-button" disabled={!canRotate||!rotation} onClick={()=>void save()}>{saving?'저장 중…':'회전 저장'}</button>
    </div>}
   </>:photo.content_type==='image/heic'?<p>HEIC 파일은 다운로드해서 확인할 수 있습니다.</p>:<img className="large-preview" src={url} alt={photo.filename}/>}
   {error&&<p className="error-banner" role="alert">{error}</p>}
   <a className="secondary-button" href={'/api/photos/'+encodeURIComponent(photo.id)+'?download=1'} download><ArrowDownToLine size={17}/>사진 다운로드</a>
  </DialogContent>
 </Dialog>;
}
