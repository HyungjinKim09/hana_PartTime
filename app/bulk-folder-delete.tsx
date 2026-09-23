"use client";
import {useRef,useState} from 'react';
import {Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {Folder} from '@/lib/types';
export type DeleteGroup={key:string;label:string;folders:Folder[]};
type Preview={folders:number;photos:number;drawings:number;sources:number;bytes:number};
type Continuation={folderIds:string[];sourceIds:string[]};
export function BulkFolderDelete({groups,disabled,onBusy,onDone}:{groups:DeleteGroup[];disabled:boolean;onBusy:(busy:boolean)=>void;onDone:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<DeleteGroup[]>([]),[chosen,setChosen]=useState<string[]>([]),[preview,setPreview]=useState<Preview|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[started,setStarted]=useState(false),[remaining,setRemaining]=useState<number|null>(null),[error,setError]=useState(''),[done,setDone]=useState(false);
 const continuation=useRef<Continuation|null>(null),ids=useRef<string[]>([]);
 const picked=[...new Set(items.filter(g=>chosen.includes(g.key)).flatMap(g=>g.folders.map(f=>f.id)))];
 function begin(){setItems(groups);setChosen([]);setPreview(null);setConfirmed(false);setError('');setDone(false);setStarted(false);setRemaining(null);continuation.current=null;setOpen(true);}
 function select(next:string[]){setChosen(next);setPreview(null);setConfirmed(false);setError('');}
 async function review(){setBusy(true);setError('');try{ids.current=picked;const r=await fetch('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:picked})});const data=await r.json() as Preview & {error?:string};if(!r.ok)throw Error(data.error||'삭제 대상을 확인하지 못했습니다.');setPreview(data);}catch(e){setError(e instanceof Error?e.message:'확인 실패');}finally{setBusy(false);}}
 async function remove(){if(!confirmed||!preview)return;setBusy(true);onBusy(true);setStarted(true);setError('');try{
  for(;;){const response=await fetch('/api/folders?batch=1',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(continuation.current||{ids:ids.current})});const result=await response.json() as {deleted:boolean;error?:string;continuation?:Continuation;remaining:number};if(!response.ok)throw Error(result.error||'삭제하지 못했습니다.');if(result.deleted)break;if(!result.continuation)throw Error('삭제 진행 정보를 확인하지 못했습니다.');continuation.current=result.continuation;setRemaining(result.remaining);}
  await onDone();setDone(true);setRemaining(0);
 }catch(e){setError((e instanceof Error?e.message:'삭제 실패')+' 일부 자료가 이미 삭제되었을 수 있습니다. 다시 시도하면 남은 자료부터 처리합니다.');await onDone();}finally{setBusy(false);onBusy(false);}}
 return <><button className="secondary-button bulk-delete-entry" disabled={disabled||!groups.length} onClick={begin}><Trash2 size={16}/>폴더 선택 삭제</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="bulk-delete-dialog" onInteractOutside={e=>{if(busy)e.preventDefault();}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle>폴더 선택 삭제</DialogTitle><DialogDescription>현재 위치 또는 검색 결과에서 삭제할 폴더를 선택하세요. 선택한 폴더의 모든 날짜·하위 일정이 포함됩니다.</DialogDescription></DialogHeader>
 {done?<p role="status">선택한 폴더와 포함된 자료를 삭제했습니다.</p>:<>
 {!preview?<><div className="bulk-selection-toolbar"><button className="secondary-button" disabled={busy} onClick={()=>select(items.map(g=>g.key))}>전체 선택</button><button className="secondary-button" disabled={busy} onClick={()=>select([])}>선택 해제</button><span>{picked.length}개 일정 선택</span></div><div className="bulk-selection-list">{items.map(group=><label key={group.key}><input type="checkbox" disabled={busy} checked={chosen.includes(group.key)} onChange={e=>select(e.target.checked?[...chosen,group.key]:chosen.filter(k=>k!==group.key))}/><span><strong>{group.label}</strong><small>{group.folders.length}개 일정 · 사진·도면 {group.folders.reduce((n,f)=>n+f.count,0)}장</small></span></label>)}</div><button className="primary-button" disabled={busy||!picked.length} onClick={()=>void review()}>{busy?'확인 중…':'삭제 대상 확인'}</button></>:<>
 <div className="bulk-delete-summary"><strong>선택한 일정 폴더 {preview.folders}개</strong><p>현장 사진 {preview.photos-preview.drawings}장 · 도면 사진 {preview.drawings}장 · 일정표 원본 {preview.sources}장</p><p>원본 용량 약 {(preview.bytes/1024/1024).toFixed(1)} MB</p><p>사진·썸네일·도면 초안·일정·주소·조사 상태·비고가 함께 영구 삭제됩니다. 일정표 원본은 해당 날짜의 마지막 일정까지 선택한 경우 삭제됩니다.</p></div>
 <p className="review-hint">ZIP에는 현장 사진만 들어갑니다. 도면과 조사 기록 등 필요한 자료도 별도로 보관했는지 확인해 주세요.</p><label className="bulk-delete-confirm"><input type="checkbox" checked={confirmed} disabled={busy||started} onChange={e=>setConfirmed(e.target.checked)}/>필요한 자료를 보관했으며, 삭제 후 복구할 수 없음을 확인했습니다.</label>
 {remaining!==null&&<p role="status">삭제할 파일 {remaining}개 남음</p>}<div className="bulk-delete-actions">{!started&&<button className="secondary-button" disabled={busy} onClick={()=>{setPreview(null);setConfirmed(false);}}>선택 수정</button>}<button className="primary-button destructive-button" disabled={busy||!confirmed} onClick={()=>void remove()}>{busy?'삭제 중…':started?'남은 자료 삭제 재시도':'선택한 폴더와 자료 모두 삭제'}</button></div></>}
 {error&&<p className="error-banner" role="alert">{error}</p>}</>}
 </DialogContent></Dialog></>;
}
