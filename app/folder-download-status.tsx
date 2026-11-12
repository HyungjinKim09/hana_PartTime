"use client";
import {Check} from 'lucide-react';
import type {Folder} from '@/lib/types';
import type {LibrarySummary} from '@/lib/library-types';
export function DownloadSummary({summary}:{summary:LibrarySummary}){
 if(!summary.withFieldPhotos)return null;
 const count=summary.downloaded||0,label=summary.schedules===1?(count?'사진 다운로드 완료':summary.downloadedBy?'사진 변경됨 · 다시 다운로드 필요':'사진 다운로드 미완료'):`사진 다운로드 ${count}/${summary.withFieldPhotos}개 완료`;
 return <span className={'folder-download-badge'+(count===summary.withFieldPhotos?' complete':'')}>{count>0&&<Check size={13}/>} {label}</span>;
}
export function FolderDownloadStatus({folder}:{folder:Folder}){
 return <div className="folder-download-status">
  <div>
   <strong>{folder.downloadComplete?'사진 다운로드 완료':folder.downloadedBy?'사진 변경됨 · 다시 다운로드 필요':'사진 다운로드 미완료'}</strong>
   {folder.downloadedBy&&<small>{folder.downloadedBy.name} · {new Date(folder.downloadedBy.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}{folder.downloadedBy.restored?' · 복원 기록':''}</small>}
  </div>
 </div>;
}
