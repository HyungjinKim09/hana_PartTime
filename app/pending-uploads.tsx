"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {listPending,deletePending,watchPending,type PendingUpload} from '@/lib/pending-uploads';
import {uploadPhotos} from '@/lib/photo-upload';
import type {Folder} from '@/lib/types';
export function PendingUploads({owner,folders,disabled,onBusy,onDone}:{owner:string;folders:Folder[];disabled:boolean;onBusy:(busy:boolean)=>void;onDone:()=>Promise<void>}){
 const [items,setItems]=useState<PendingUpload[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const controller=useRef<AbortController|null>(null);
 const reload=useCallback(()=>{void listPending(owner).then(setItems).catch(()=>setError('이 기기의 임시 보관함을 읽지 못했습니다. 브라우저 저장소 권한을 확인해 주세요.'));},[owner]);
 useEffect(()=>{reload();return watchPending(reload);},[reload]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function retry(){if(busy||disabled)return;setBusy(true);onBusy(true);setError('');const task=new AbortController();controller.current=task;
  try{let done=0;for(const item of items){if(task.signal.aborted)break;if(!folders.some(f=>f.id===item.folder)){setError('원래 일정 폴더가 없는 사진이 있습니다. 원본을 기기에 저장한 뒤 다른 일정에 올려 주세요.');continue;}
   const result=await uploadPhotos([item.file],item.folder,item.kind,{signal:task.signal,onSaved:async()=>{await deletePending(owner,item.id);},onError:(_file,e)=>setError(e.message)});done+=result.saved;setProgress(`${done} / ${items.length}장 저장`);
  }await onDone();}finally{controller.current=null;setBusy(false);onBusy(false);reload();}
 }
 function download(item:PendingUpload){const url=URL.createObjectURL(item.file),a=document.createElement('a');a.href=url;a.download=item.file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 return <><button className="secondary-button" disabled={disabled||busy} onClick={()=>{reload();setOpen(true);}}>미전송 사진 {items.length>0?`${items.length}장`:''}</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent><DialogHeader><DialogTitle>기기에 임시 보관한 사진</DialogTitle><DialogDescription>서버 저장이 확인된 사진만 자동으로 제거합니다. 브라우저 데이터 삭제나 기기 초기화 시 임시 사진은 복구할 수 없습니다.</DialogDescription></DialogHeader>{error&&<p className="error-banner" role="alert">{error}</p>}<p role="status">{progress||`${items.length}장 보관 중 · 최대 200장 / 512MB`}</p><div className="pending-recovery-list">{items.map(item=><div key={item.key}><strong>{item.file.name}</strong><small>{folders.find(f=>f.id===item.folder)?.lot||'원래 폴더 없음'} · {(item.file.size/1e6).toFixed(1)} MB</small><button className="subtle-button" onClick={()=>download(item)}>기기에 원본 저장</button><button className="subtle-button" disabled={busy} onClick={()=>{if(window.confirm('이 미전송 사진을 기기 임시 보관에서 삭제할까요?'))void deletePending(owner,item.id).then(reload).catch(()=>setError('삭제하지 못했습니다.'));}}>보관에서 삭제</button></div>)}</div>{busy?<button className="secondary-button" onClick={()=>controller.current?.abort()}>전송 중단</button>:<button className="primary-button" disabled={disabled||!items.length} onClick={()=>void retry()}>남은 사진 다시 업로드</button>}</DialogContent></Dialog></>;
}
