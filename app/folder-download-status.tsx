"use client";
import {useState} from 'react';
import {Check} from 'lucide-react';
import type {Folder} from '@/lib/types';
import type {LibrarySummary} from '@/lib/library-types';
export function DownloadSummary({summary}:{summary:LibrarySummary}){
 if(!summary.withFieldPhotos)return null;
 const count=summary.downloaded||0,label=summary.schedules===1?(count?'사진 다운로드 완료':summary.downloadedBy?'사진 변경됨 · 다시 다운로드 필요':'사진 다운로드 미완료'):`사진 다운로드 ${count}/${summary.withFieldPhotos}개 완료`;
 return <span className={'folder-download-badge'+(count===summary.withFieldPhotos?' complete':'')}>{count>0&&<Check size={13}/>} {label}</span>;
}
export function FolderDownloadStatus({folder,disabled,onChanged}:{folder:Folder;disabled?:boolean;onChanged:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function clear(){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/folder-downloads',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:folder.id,revision:folder.downloadRevision})}),data=await r.json() as {error?:string};if(!r.ok)throw Error(data.error);await onChanged();}catch(e){setError(e instanceof Error?e.message:'완료 표시를 해제하지 못했습니다.');}finally{setBusy(false);}}
 return <div className="folder-download-status"><div><strong>{folder.downloadComplete?'사진 다운로드 완료':folder.downloadedBy?'사진 변경됨 · 다시 다운로드 필요':'사진 다운로드 미완료'}</strong>{folder.downloadedBy?<small>{folder.downloadedBy.name} · {new Date(folder.downloadedBy.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} 수동 확인{folder.downloadedBy.restored?' · 복원 기록':''}</small>:<small>ZIP을 받은 뒤 완료로 표시할지 직접 선택할 수 있습니다.</small>}</div>{folder.downloadedBy&&<button className="secondary-button" disabled={disabled||busy} onClick={()=>void clear()}>{busy?'처리 중…':'완료 표시 해제'}</button>}{error&&<p role="alert" className="error-banner">{error}</p>}</div>;
}
