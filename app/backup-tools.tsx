'use client';
import {useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {backupRequest,chooseBackupDirectory,inspectBackup,makeBackup,restoreBackup,supportsDirectoryBackup,type BackupDirectory} from '@/lib/backup-client';
import type {BackupManifest} from '@/lib/backup-format';
export function BackupTools({onDone}:{onDone:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[preview,setPreview]=useState<{root:BackupDirectory;manifest:BackupManifest}|null>(null),[jobs,setJobs]=useState<{id:string;prefix:string;status:string}[]>([]);
 const controller=useRef<AbortController|null>(null);
 async function run(work:(signal:AbortSignal)=>Promise<unknown>){if(controller.current)return;const c=new AbortController();controller.current=c;setBusy(true);try{await work(c.signal);}catch(e){setMessage(c.signal.aborted?'중단했습니다. 같은 백업 폴더를 선택하면 이어서 진행할 수 있습니다.':e instanceof Error?e.message:'처리하지 못했습니다.');}finally{setBusy(false);controller.current=null;}}
 function backup(resume:boolean){void run(async signal=>{const root=await chooseBackupDirectory('readwrite');setPreview(null);await makeBackup(root,resume,signal,setMessage);});}
 function inspect(){void run(async signal=>{const root=await chooseBackupDirectory('read');setPreview(null);const manifest=await inspectBackup(root,signal,setMessage);setPreview({root,manifest});setMessage('파일 검증 완료. 복원할 내용을 확인해 주세요.');});}
 async function loadJobs(){try{setJobs((await backupRequest('/api/restore')).jobs);}catch(e){setMessage(e instanceof Error?e.message:'복원 작업을 읽지 못했습니다.');}}
 function cleanUploads(){void run(async signal=>{let more=true,removed=0;while(more){signal.throwIfAborted();const result=await backupRequest<{removed:number;more:boolean}>('/api/maintenance',{},signal);removed+=result.removed;more=result.more;}setMessage(`중단된 업로드 임시 파일 ${removed}개를 정리했습니다.`);await onDone();});}
 function cleanup(id:string){if(!window.confirm('이 미완료 복원의 임시 자료를 삭제할까요? 기존 일정과 완료된 복원에는 영향을 주지 않습니다.'))return;void run(async signal=>{let done=false;while(!done){signal.throwIfAborted();const r=await fetch('/api/restore?job='+id,{method:'DELETE',signal});const result=await r.json() as {error?:string;done:boolean;wait?:boolean;message?:string};if(!r.ok)throw Error(result.error);done=result.done;if(!done){setMessage(result.message||'임시 파일 정리 중…');if(result.wait)break;}}if(done)setMessage('미완료 복원을 정리했습니다.');await loadJobs();});}
 return <><Button variant="outline" onClick={()=>{setOpen(true);void loadJobs();}}>전체 백업·복원</Button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>전체 자료 백업·복원</DialogTitle></DialogHeader>
 <p className="text-sm text-muted-foreground">현장 사진, 일정표 원본, 조사 기록, 도면과 수정 내용을 함께 보관합니다. 일반 사진 ZIP 다운로드와 별도로 이용하세요.</p>
 {!supportsDirectoryBackup()?<p>데스크톱 Chrome 또는 Edge에서 이 기능을 이용해 주세요.</p>:<div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>backup(false)}>새 전체 백업</Button><Button disabled={busy} variant="outline" onClick={()=>backup(true)}>백업 이어서 하기</Button><Button disabled={busy} variant="outline" onClick={inspect}>백업 폴더로 복원</Button></div>}
 <Button disabled={busy} variant="outline" onClick={cleanUploads}>중단된 업로드 임시 파일 정리</Button>
 <p className="text-xs text-muted-foreground">백업 중에는 자료 수정을 마친 뒤 진행해 주세요. 모든 파일 검증이 끝나야 완료 표시가 생깁니다. 복원은 별도 ‘복원 …’ 구역에 추가됩니다.</p>
 {preview&&<div className="rounded-md border p-3 text-sm"><p>일정 {preview.manifest.folders.length}개 · 원본 {preview.manifest.files.length}개 · 도면 편집 {preview.manifest.drawings.length}개</p><Button disabled={busy} className="mt-3" onClick={()=>void run(async signal=>{await restoreBackup(preview.root,preview.manifest,signal,setMessage);setPreview(null);await onDone();await loadJobs();})}>확인한 자료를 새 구역에 복원</Button></div>}
 {message&&<p role="status" className="break-words text-sm">{message}</p>}{busy&&<Button variant="outline" onClick={()=>controller.current?.abort()}>중단</Button>}
 {!!jobs.length&&<div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">미완료 복원</p>{jobs.map(job=><div key={job.id} className="flex items-center justify-between gap-2 text-xs"><span className="break-all">{job.prefix}</span><Button disabled={busy} size="sm" variant="outline" onClick={()=>cleanup(job.id)}>임시 자료 정리</Button></div>)}</div>}
 </DialogContent></Dialog></>;
}
