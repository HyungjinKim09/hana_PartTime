"use client";
import {useEffect,useState} from 'react';
import {RotateCcw,RotateCw} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {listFolderRotationPhotos,PhotoRotationError,rotateFolderPhoto} from '@/lib/photo-rotation';
import {folderLabel,type Folder,type Photo} from '@/lib/types';

export type FolderRotationScope={folder:Folder;view:'date'|'address'};
type Failure={photo:Photo;message:string;retryable:boolean};
type Result={saved:number;failed:Failure[];remaining:Photo[];notice:string};

export function FolderPhotoRotation({scope,onClose,onBusy,onChanged}:{scope:FolderRotationScope;onClose:()=>void;onBusy:(busy:boolean)=>void;onChanged:(folders:string[])=>void}){
 const {folder,view}=scope;
 const [photos,setPhotos]=useState<Photo[]|null>(null),[loadError,setLoadError]=useState('');
 const [rotation,setRotation]=useState<90|270|null>(null),[result,setResult]=useState<Result|null>(null);
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState({done:0,total:0});

 useEffect(()=>{
  const controller=new AbortController();
  void listFolderRotationPhotos(folder.id,view,controller.signal).then(data=>{
   if(!controller.signal.aborted)setPhotos(data);
  }).catch(error=>{if(!controller.signal.aborted)setLoadError(error instanceof Error?error.message:'폴더의 사진을 불러오지 못했습니다.');});
  return ()=>controller.abort();
 },[folder.id,view]);

 const retries=result?[...result.failed.filter(item=>item.retryable).map(item=>item.photo),...result.remaining]:[];
 async function save(targets:Photo[]){
  if(!rotation||!targets.length||busy)return;
  setBusy(true);onBusy(true);setProgress({done:0,total:targets.length});
  const failed=result?.failed.filter(item=>!item.retryable)??[];
  let saved=result?.saved??0,remaining:Photo[]=[],notice='';
  const affected=new Set<string>();
  try{
   for(const [index,photo] of targets.entries()){
    affected.add(photo.folder);
    try{await rotateFolderPhoto(photo,rotation);saved++;}
    catch(error){
     const status=error instanceof PhotoRotationError?error.status:0;
     const message=error instanceof Error?error.message:'회전 저장에 실패했습니다.';
     failed.push({photo,message,retryable:status===0||status===401||status===429||status>=500});
     if(status===401||status===429){notice=message;remaining=targets.slice(index+1);break;}
    }
    setProgress({done:index+1,total:targets.length});
   }
   setResult({saved,failed,remaining,notice});
   onChanged([...affected]);
  }finally{setBusy(false);onBusy(false);}
 }

 const scopeLabel=view==='address'?'이 주소의 모든 날짜':folder.date;
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}>
  <DialogContent className="photo-edit-dialog folder-photo-rotation-dialog" showCloseButton={!busy}>
   <DialogHeader><DialogTitle>폴더 사진 전체 회전</DialogTitle><DialogDescription>{folderLabel(folder)} · {scopeLabel}의 현장 사진</DialogDescription></DialogHeader>
   {loadError?<p className="error-banner" role="alert">{loadError}</p>:!photos?<p role="status">폴더의 사진을 확인하는 중…</p>:photos.length===0?<p>회전할 현장 사진이 없습니다.</p>:<>
    {!result&&!busy&&<>
     <p>현장 사진 {photos.length}장을 같은 방향으로 돌려 저장합니다.</p>
     <div className="photo-rotation-actions" role="group" aria-label="회전 방향">
      <button type="button" className="secondary-button" aria-pressed={rotation===270} onClick={()=>setRotation(270)}><RotateCcw size={16}/>왼쪽 90°</button>
      <button type="button" className="secondary-button" aria-pressed={rotation===90} onClick={()=>setRotation(90)}><RotateCw size={16}/>오른쪽 90°</button>
     </div>
     <button className="primary-button" disabled={!rotation} onClick={()=>void save(photos)}>전체 회전 저장</button>
    </>}
    {busy&&<div className="folder-rotation-progress"><p role="status">회전 저장 중 · {progress.done} / {progress.total}장</p><Progress aria-label="사진 회전 진행률" value={progress.done/progress.total*100}/><p>저장이 끝날 때까지 화면을 열어 두세요.</p></div>}
    {!busy&&result&&<>
     <p role="status">저장 {result.saved}장{result.failed.length>0&&` · 저장 못함 ${result.failed.length}장`}{result.remaining.length>0&&` · 대기 ${result.remaining.length}장`}</p>
     {result.notice&&<p className="error-banner" role="alert">{result.notice}</p>}
     {result.failed.length>0&&<details className="folder-rotation-failures"><summary>저장 못한 사진 보기</summary><ul>{result.failed.map(({photo,message})=><li key={photo.id}><strong>{photo.filename}</strong> · {message}</li>)}</ul></details>}
     {retries.length>0&&<button className="secondary-button" onClick={()=>void save(retries)}>남은 사진만 다시 시도</button>}
     <button className="primary-button" onClick={onClose}>닫기</button>
    </>}
   </>}
  </DialogContent>
 </Dialog>;
}
