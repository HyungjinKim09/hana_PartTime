import {backupCatalogSchema,backupPath,validateBackup,sha256,type BackupCatalog,type BackupFile,type BackupManifest} from './backup-format.ts';
type DiskFile={getFile():Promise<File>;createWritable():Promise<{write(data:Blob|string):Promise<void>;close():Promise<void>;abort():Promise<void>}>};
export type BackupDirectory={name:string;getDirectoryHandle(name:string,options?:{create?:boolean}):Promise<BackupDirectory>;getFileHandle(name:string,options?:{create?:boolean}):Promise<DiskFile>};
type DirectoryWindow=Window&{showDirectoryPicker?:(options:{mode:'read'|'readwrite'})=>Promise<BackupDirectory>};
export function supportsDirectoryBackup(){return typeof window!=='undefined'&&!!(window as DirectoryWindow).showDirectoryPicker;}
export function chooseBackupDirectory(mode:'read'|'readwrite'){const picker=(window as DirectoryWindow).showDirectoryPicker;if(!picker)throw Error('전체 백업·복원은 데스크톱 Chrome 또는 Edge에서 이용해 주세요.');return picker({mode});}
type Progress=(message:string)=>void;
type BackupResponse={error?:string;status:string;prefix:string;url:string;saved:{kind:string;id:string}[];jobs:{id:string;prefix:string;status:string}[]};
export async function backupRequest<T=BackupResponse>(path:string,body?:unknown,signal?:AbortSignal){const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal,cache:'no-store'});const data=await r.json() as BackupResponse;if(!r.ok)throw Error(data.error||'백업 요청을 처리하지 못했습니다.');return data as T;}
async function diskFile(root:BackupDirectory,path:string,create=false){const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw Error('백업 경로가 올바르지 않습니다.');let dir=root;for(const p of parts.slice(0,-1))dir=await dir.getDirectoryHandle(p,{create});return dir.getFileHandle(parts.at(-1)!,{create});}
async function read(root:BackupDirectory,path:string){return (await diskFile(root,path)).getFile();}
async function write(root:BackupDirectory,path:string,data:Blob|string){const stream=await (await diskFile(root,path,true)).createWritable();try{await stream.write(data);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}}
export async function makeBackup(parent:BackupDirectory,resume:boolean,signal:AbortSignal,progress:Progress){
 const catalog:BackupCatalog=backupCatalogSchema.parse(resume?JSON.parse(await (await read(parent,'backup-plan.json')).text()):await backupRequest('/api/backup',undefined,signal));
 const root=resume?parent:await parent.getDirectoryHandle(`HANA-${catalog.createdAt.slice(0,10)}-${catalog.backupId.slice(0,8)}`,{create:true});
 await write(root,'backup-plan.json',JSON.stringify(catalog));
 const originals=[...catalog.photos.map(p=>({...p,kind:'photo' as const})),...catalog.sources.map(p=>({...p,kind:'schedule' as const}))],files:BackupFile[]=[];
 for(const [index,p] of originals.entries()){
  signal.throwIfAborted();progress(`원본 확인·저장 ${index+1}/${originals.length}`);
  const path=backupPath(p.kind,p.id,p.content_type),receipt=`receipts/${p.kind}-${encodeURIComponent(p.id).replace(/\./g,'%2E')}.json`;
  let valid:BackupFile|null=null;
  try{const saved=JSON.parse(await (await read(root,receipt)).text()) as BackupFile,bytes=await (await read(root,path)).arrayBuffer();if(saved.id===p.id&&saved.kind===p.kind&&saved.path===path&&saved.size===p.size&&bytes.byteLength===p.size&&saved.sha256===await sha256(bytes))valid=saved;}catch{/* A missing or damaged local original is fetched again. */}
  if(!valid){const ticket=await backupRequest('/api/backup',{kind:p.kind,id:p.id},signal),response=await fetch(ticket.url,{signal});if(!response.ok)throw Error('원본을 내려받지 못했습니다. 같은 폴더로 이어서 백업해 주세요.');const bytes=await response.arrayBuffer();if(bytes.byteLength!==p.size)throw Error('백업 도중 원본 크기가 변경됐습니다. 새 백업을 시작해 주세요.');const hash=await sha256(bytes);await write(root,path,new Blob([bytes],{type:p.content_type}));if(await sha256(await (await read(root,path)).arrayBuffer())!==hash)throw Error('디스크에 저장한 원본 검증에 실패했습니다.');valid={kind:p.kind,id:p.id,path,size:p.size,sha256:hash};await write(root,receipt,JSON.stringify(valid));}
  files.push(valid);
 }
 signal.throwIfAborted();const manifest=validateBackup({...catalog,files});await write(root,'manifest.json',JSON.stringify(manifest));progress(`백업 완료: ${root.name} · 원본 ${files.length}개`);return manifest;
}
export async function inspectBackup(root:BackupDirectory,signal:AbortSignal,progress:Progress){
 const manifestFile=await read(root,'manifest.json');if(manifestFile.size>100*1024*1024)throw Error('백업 목록 파일이 너무 큽니다.');
 const manifest=validateBackup(JSON.parse(await manifestFile.text()));
 for(const [index,file] of manifest.files.entries()){signal.throwIfAborted();progress(`복원 전 파일 검증 ${index+1}/${manifest.files.length}`);const bytes=await (await read(root,file.path)).arrayBuffer();if(bytes.byteLength!==file.size||await sha256(bytes)!==file.sha256)throw Error(`원본 파일이 누락되거나 손상됐습니다: ${file.path}`);}
 return manifest;
}
export async function restoreBackup(root:BackupDirectory,manifest:BackupManifest,signal:AbortSignal,progress:Progress){
 const header={format:manifest.format,version:manifest.version,backupId:manifest.backupId,createdAt:manifest.createdAt,manifestHash:await sha256(new TextEncoder().encode(JSON.stringify(manifest))),folders:manifest.folders.length,photos:manifest.photos.length,sources:manifest.sources.length,drawings:manifest.drawings.length};
 const started=await backupRequest('/api/restore',{action:'start',header},signal),job=manifest.backupId;
 if(started.status==='complete'){progress('이미 복원 완료한 백업입니다. 중복 자료를 만들지 않았습니다.');return;}
 const groups={folder:manifest.folders,photo:manifest.photos,source:manifest.sources,drawing:manifest.drawings,file:manifest.files};
 let chunk:unknown[]=[],length=0;
 for(const [kind,values] of Object.entries(groups))for(const [position,value] of values.entries()){
  const record={kind,position,value},size=JSON.stringify(record).length*3;
  if(chunk.length&&(chunk.length>=20||length+size>1200000)){await backupRequest('/api/restore',{action:'records',job,records:chunk},signal);chunk=[];length=0;}
  chunk.push(record);length+=size;
 }
 if(chunk.length)await backupRequest('/api/restore',{action:'records',job,records:chunk},signal);
 const status=await backupRequest('/api/restore?job='+job,undefined,signal),saved=new Set(status.saved.map((f:{kind:string;id:string})=>f.kind+':'+f.id));
 for(const [index,file] of manifest.files.entries()){
  signal.throwIfAborted();progress(`서버에 복원 ${index+1}/${manifest.files.length}`);if(saved.has(file.kind+':'+file.id))continue;
  const bytes=await read(root,file.path);if(bytes.size!==file.size||await sha256(await bytes.arrayBuffer())!==file.sha256)throw Error('검증 이후 백업 파일이 변경됐습니다. 다시 선택해 주세요.');
  const response=await fetch('/api/restore?'+new URLSearchParams({job,kind:file.kind,id:file.id}),{method:'PUT',body:bytes,signal});if(!response.ok){const result=await response.json() as {error?:string};throw Error(result.error||'원본 복원에 실패했습니다. 같은 백업으로 다시 시도해 주세요.');}
 }
 const done=await backupRequest('/api/restore',{action:'finish',job},signal);progress(`복원 완료: ${done.prefix}`);
}
