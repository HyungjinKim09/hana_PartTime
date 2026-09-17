"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {Plus,Archive,ArrowLeft,ArrowDownToLine,Camera,Check,ChevronRight,Clock,CloudUpload,Folder as FolderIcon,FolderOpen,Image as ImageIcon,LockKeyhole,MapPin,Phone,RefreshCw,TriangleAlert,Trash2,UserRound} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Progress} from '@/components/ui/progress';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';
import {folderLabel,type Folder,type Photo} from '@/lib/types';
import {FolderRemarks,DailyReportButton} from './report-tools';
import {ImportSchedule} from './import-schedule';
import {registerPhotoTools} from '@/lib/webmcp';
import type {BudgetUsage} from '@/lib/r2-budget';
import {exportFolderLabel} from '@/lib/daily-report';
import {BatchCamera} from './batch-camera';
import {ArchiveDownload} from './archive-download';

const formatBytes=(n:number)=>n>=1024**3?`${(n/1024**3).toFixed(1)} GB`:n>=1024**2?`${(n/1024**2).toFixed(1)} MB`:`${Math.ceil(n/1024)} KB`;
const dateText=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export default function Workspace({userName,isAdmin=false}:{userName:string;isAdmin?:boolean}){
  useEffect(registerPhotoTools,[]);
  const [cameraPending,setCameraPending]=useState(false);
  const [folderDelete,setFolderDelete]=useState(false),[folderDeleteBusy,setFolderDeleteBusy]=useState(false);
  const [manualImport,setManualImport]=useState(false);
  const [remarksDirty,setRemarksDirty]=useState(false);
  const [region,setRegion]=useState<string|null>(null),[date,setDate]=useState<string|null>(null),[importing,setImporting]=useState(false);
  const [folders,setFolders]=useState<Folder[]>([]),[photos,setPhotos]=useState<Photo[]>([]);
  const [usage,setUsage]=useState<BudgetUsage|null>(null);
  const [selected,setSelected]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [uploading,setUploading]=useState(false),[progress,setProgress]=useState({done:0,total:0}),[failed,setFailed]=useState<File[]>([]);
  const [preview,setPreview]=useState<Photo|null>(null),[deleting,setDeleting]=useState<Photo|null>(null),[deleteBusy,setDeleteBusy]=useState(false);
  const [exportScope,setExportScope]=useState<string|null|undefined>(undefined),[dragging,setDragging]=useState(false);
  const input=useRef<HTMLInputElement>(null),sequence=useRef(0);
  const active=folders.find(f=>f.id===selected), total=folders.reduce((n,f)=>n+f.count,0),bytes=folders.reduce((n,f)=>n+f.bytes,0);
  const refresh=useCallback(async(folder:string|null,quiet=false)=>{
    const seq=++sequence.current; if(!quiet)setLoading(true);
    try{const r=await fetch('/api/library'+(folder?'?folder='+encodeURIComponent(folder):''),{cache:'no-store'});const data=await r.json() as {error?:string;folders:Folder[];photos:Photo[];usage:BudgetUsage};if(!r.ok)throw new Error(data.error||'불러오지 못했습니다.');if(seq===sequence.current){setFolders(data.folders);setPhotos(data.photos);setUsage(data.usage);setError('');}}
    catch(e){if(seq===sequence.current)setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}
    finally{if(seq===sequence.current)setLoading(false);}
  },[]);
  useEffect(()=>{setPhotos([]);setFailed([]);void refresh(selected);},[selected,refresh]);
  useEffect(()=>{const update=()=>{if(!uploading && document.visibilityState==='visible')void refresh(selected,true);};window.addEventListener('focus',update);const timer=setInterval(update,30000);return()=>{window.removeEventListener('focus',update);clearInterval(timer);};},[selected,refresh,uploading]);
  useEffect(()=>{if(!uploading&&!remarksDirty&&!cameraPending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uploading,remarksDirty,cameraPending]);

  async function upload(files:File[],fromCamera=false):Promise<File[]>{
    if(!selected||uploading||!files.length)return files;
    const target=selected;setUploading(true);setFailed([]);setProgress({done:0,total:files.length});
    const failures:File[]=[];let saved=0;
    for(let i=0;i<files.length;i++){
      const file=files[i];
      try{if(file.size>20*1024*1024)throw new Error('한 장당 20MB까지 올릴 수 있어요.');
        const r=await fetch(`/api/library?folder=${encodeURIComponent(target)}&filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
        const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error||'업로드 실패');saved++;
      }catch(e){failures.push(file);toast.error(`${file.name}: ${e instanceof Error?e.message:'업로드 실패'}`);}
      setProgress({done:i+1,total:files.length});
    }
    setFailed(fromCamera?[]:failures);setUploading(false);await refresh(target,true);
    if(saved)toast.success(`${saved}장 저장 완료`);
    if(input.current)input.current.value='';
    return failures;
  }
  async function removePhoto(){if(!deleting)return;setDeleteBusy(true);try{
    const r=await fetch('/api/library?id='+encodeURIComponent(deleting.id),{method:'DELETE'});const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error);
    toast.success('사진을 삭제했어요.');setDeleting(null);await refresh(selected,true);
  }catch(e){toast.error(e instanceof Error?e.message:'삭제하지 못했습니다.');}finally{setDeleteBusy(false);}}
  function navigate(id:string|null){location(region,date,id);}
  const exportFolder=folders.find(f=>f.id===exportScope);
  const scoped=folders.filter(f=>(!region||f.region===region)&&(!date||f.date===date));
  const regions=[...new Set(folders.map(f=>f.region))];
  const dates=[...new Set(scoped.map(f=>f.date))].sort().reverse();
  const exportQuery=new URLSearchParams(exportFolder?{folder:exportFolder.id}:region?date?{region,date}:{region}:{});
  const exportItems=exportFolder?[exportFolder]:scoped;
  const navigationGuard=useRef({uploading:false,remarksDirty:false,folderDeleteBusy:false,cameraPending:false});
  navigationGuard.current={uploading,remarksDirty,folderDeleteBusy,cameraPending};
  const historyPosition=useRef<{index:number;parents:number[]}>({index:0,parents:[]});
  function locationUrl(r:string|null,d:string|null,id:string|null){const q=new URLSearchParams();if(r)q.set('region',r);if(d)q.set('date',d);if(id)q.set('folder',id);return window.location.pathname+window.location.search+(q.size?'#'+q.toString():'');}
  function pushLocation(r:string|null,d:string|null,id:string|null){
    const url=locationUrl(r,d,id);if(url===window.location.pathname+window.location.search+window.location.hash)return;
    const depth=id?3:d?2:r?1:0,previous=historyPosition.current,parents=previous.parents.slice(0,depth);
    if(parents.length<depth)parents.push(previous.index);
    const position={index:previous.index+1,parents};window.history.pushState({...window.history.state,hanaNavigation:position},'',url);historyPosition.current=position;
  }
  useEffect(()=>{
    const restore=()=>{historyPosition.current=window.history.state?.hanaNavigation||{index:0,parents:[]};const q=new URLSearchParams(window.location.hash.slice(1));setRegion(q.get('region'));setDate(q.get('date'));setSelected(q.get('folder'));setPreview(null);setExportScope(undefined);setImporting(false);setFolderDelete(false);setRemarksDirty(false);};
    const pop=()=>{
      const old=historyPosition.current,next=window.history.state?.hanaNavigation as typeof old|undefined,g=navigationGuard.current;
      if(next?.index===old.index)return;
      if(next&&next.index!==old.index){
        if(g.uploading||g.folderDeleteBusy||(g.remarksDirty&&!window.confirm('저장하지 않은 비고를 버리고 이동할까요?'))||(g.cameraPending&&!window.confirm('아직 업로드하지 않은 촬영 사진을 버리고 이동할까요?'))){window.history.go(old.index-next.index);return;}
        if(next.index<old.index&&old.parents.length&&!old.parents.includes(next.index)){window.history.go(old.parents[old.parents.length-1]-next.index);return;}
      }
      restore();
    };
    if(!window.history.state?.hanaNavigation){const q=new URLSearchParams(window.location.hash.slice(1)),r=q.get('region'),d=q.get('date'),id=q.get('folder');historyPosition.current={index:0,parents:[]};window.history.replaceState({...window.history.state,hanaNavigation:historyPosition.current},'',locationUrl(null,null,null));if(r)pushLocation(r,null,null);if(r&&d)pushLocation(r,d,null);if(r&&d&&id)pushLocation(r,d,id);}
    restore();window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
  },[]);
  function location(r:string|null,d:string|null=null,id:string|null=null){
    if(uploading||folderDeleteBusy)return;if(remarksDirty){toast.info('비고를 저장한 뒤 이동해 주세요.');return;}
    if(r===region&&d===date&&id===selected)return;
    const depth=selected?3:date?2:region?1:0,nextDepth=id?3:d?2:r?1:0;
    if(nextDepth<depth&&(!r||r===region)&&(!d||d===date)){const position=historyPosition.current;window.history.go(position.parents[nextDepth]-position.index);return;}
    if(cameraPending&&!window.confirm('아직 업로드하지 않은 촬영 사진을 버리고 이동할까요?'))return;
    if(r&&r!==region)pushLocation(r,null,null);if(r&&d&&(r!==region||d!==date))pushLocation(r,d,null);pushLocation(r,d,id);
    setRegion(r);setDate(d);setSelected(id);window.scrollTo({top:0,behavior:'smooth'});
  }
  async function removeFolder(){
    if(!region||folderDeleteBusy)return;setFolderDeleteBusy(true);
    const query=new URLSearchParams(active?{id:active.id}:date?{region,date}:{region});
    try{let continuation:unknown=undefined;for(;;){const response=await fetch('/api/folders?'+query,{method:'DELETE',headers:continuation?{'Content-Type':'application/json'}:undefined,body:continuation?JSON.stringify(continuation):undefined});const result=await response.json() as {error?:string;deleted:boolean;continuation?:unknown};if(!response.ok)throw new Error(result.error||'폴더를 삭제하지 못했습니다. 같은 삭제 버튼으로 다시 시도해 주세요.');if(result.deleted)break;continuation=result.continuation;if(!continuation)throw new Error('삭제 진행을 확인하지 못했습니다. 다시 시도해 주세요.');}
      const next=active?{r:region,d:date}:date?{r:region,d:null}:{r:null,d:null};
      setFolderDeleteBusy(false);navigationGuard.current.folderDeleteBusy=false;const position=historyPosition.current;window.history.go(position.parents[position.parents.length-1]-position.index);setSelected(null);setRegion(next.r);setDate(next.d);setFolderDelete(false);setRemarksDirty(false);await refresh(null,true);toast.success('폴더와 포함된 자료를 삭제했습니다.');
    }catch(e){toast.error(e instanceof Error?e.message:'삭제하지 못했습니다. 다시 시도해 주세요.');await refresh(selected,true);}finally{setFolderDeleteBusy(false);}
  }


  return <div className="app-shell">
    <Toaster richColors position="top-center" theme="light"/>
    <header className="app-header"><a href="/" className="brand" aria-label="HANA 홈"><span className="brand-mark"><FolderOpen size={23}/></span><span>HANA<span className="brand-caption">현장 기록</span></span></a><div className="private-label"><LockKeyhole size={14}/>팀 공용 보관함</div></header>
    <div className="workspace-layout">
      <aside className="project-panel"><div className="panel-label">조사 프로젝트</div><button className="date-nav" disabled={uploading} onClick={()=>location(null)}><FolderOpen size={19}/><span>전체 지역</span><span className="nav-count">{regions.length}</span></button><div className="folder-index">{regions.map(r=><div key={r}><button className={region===r?'index-item active':'index-item'} disabled={uploading} onClick={()=>location(r)}><FolderIcon size={16}/><span>{r}</span></button>{region===r&&[...new Set(folders.filter(f=>f.region===r).map(f=>f.date))].sort().reverse().map(d=><button key={d} className={date===d?'index-item active date-index':'index-item date-index'} disabled={uploading} onClick={()=>location(r,d)}><span>{d}</span><span>{folders.filter(f=>f.region===r&&f.date===d).length}</span></button>)}</div>)}</div><button className="secondary-button" disabled={uploading||remarksDirty||cameraPending} onClick={()=>{setManualImport(false);setImporting(true);}}><CloudUpload size={17}/>일정표 사진 등록</button><div className="sidebar-bottom"><LockKeyhole size={16}/><div><strong>비공개 원본 보관</strong><p>공용 계정으로 PC와 휴대폰에서<br/>함께 사진을 관리합니다.</p></div></div></aside>
      <main className="main-workspace">
        {region&&<button className="back-button" disabled={uploading||folderDeleteBusy} onClick={()=>selected?location(region,date):date?location(region):location(null)}><ArrowLeft size={16}/>상위 폴더로</button>}
        <nav aria-label="현재 위치" className="breadcrumb"><button disabled={uploading} onClick={()=>location(null)}>전체 지역</button>{region&&<><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region)}>{region}</button></>}{date&&<><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region,date)}>{date}</button></>}{active&&<><ChevronRight size={14}/><span>{folderLabel(active)}</span></>}</nav>
        <section className="page-heading"><div><div className="eyebrow">FIELD SURVEY · PHOTO ARCHIVE</div><h1>{active?folderLabel(active):date?`${date} 현장조사`:region||'현장조사 보관함'}<span className="heading-label">{active?'일정 폴더':date?'일정별':region?'날짜별':'지역별'}</span></h1><p>{active?active.address:'일정표 사진을 등록하고 지역 · 날짜 · 번지별로 현장 사진을 모으세요.'}</p></div><div className="heading-actions">{region&&<button className="subtle-button" disabled={loading||uploading||remarksDirty||folderDeleteBusy||cameraPending} onClick={()=>setFolderDelete(true)}><Trash2 size={17}/>폴더 삭제</button>}<button className="secondary-button" disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>{setManualImport(true);setImporting(true);}}><Plus size={18}/>일정 직접 추가</button>{region&&date&&<DailyReportButton region={region} date={date} disabled={loading||uploading||remarksDirty||!!error}/>}<button className="secondary-button" disabled={uploading||remarksDirty||cameraPending} onClick={()=>{setManualImport(false);setImporting(true);}}><CloudUpload size={18}/>일정표 사진 등록</button><button className="primary-button" onClick={()=>setExportScope(active?.id??null)} disabled={loading||uploading||!!error}><Archive size={18}/>{region?'현재 폴더 다운로드':'전체 다운로드'}</button></div></section>
        {error&&<div className="error-banner" role="alert"><TriangleAlert size={19}/><span>{error}</span><button onClick={()=>refresh(selected)}>다시 시도</button></div>}
        {usage&&<section aria-label="보관함 사용 한도">
          <div className="overview-strip">
            <div><span>사진·일정표 저장</span><strong>{(usage.storageBytes/1e9).toFixed(2)}<small>/ {usage.storageLimit/1e9} GB</small></strong></div>
            <div><span>최근 {usage.windowDays}일 업로드 요청</span><strong>{usage.writes.toLocaleString()}<small>/ {usage.writeLimit.toLocaleString()}회</small></strong></div>
            <div><span>최근 {usage.windowDays}일 사진 읽기</span><strong>{usage.reads.toLocaleString()}<small>/ {usage.readLimit.toLocaleString()}회</small></strong></div>
          </div>
          <p className="export-help">한도에 도달하면 해당 업로드·사진 열기·다운로드가 중단됩니다. 기존 자료는 자동 삭제되지 않습니다. 사진 읽기에는 미리보기와 ZIP에 담긴 각 파일이 포함됩니다.</p>
          {(usage.storageBytes>=usage.storageLimit||usage.writes>=usage.writeLimit||usage.reads>=usage.readLimit)&&<p className="error-banner" role="status">사용 한도에 도달했습니다. 저장 공간은 불필요한 사진을 직접 삭제하면 확보할 수 있고, 요청 한도는 최근 32일 사용량이 줄어들면 다시 이용할 수 있습니다.</p>}
        </section>}
        {!active&&!selected&&<><div className="overview-strip"><div><span>조사 일정</span><strong>{scoped.length}<small>곳</small></strong></div><div><span>사진 있는 폴더</span><strong>{scoped.filter(f=>f.count>0).length}<small>/ {scoped.length}</small></strong></div><div><span>보관한 사진</span><strong>{scoped.reduce((n,f)=>n+f.count,0)}<small>장</small></strong></div><div className="storage-stat"><CloudUpload size={20}/><span>원본 저장<small>{formatBytes(scoped.reduce((n,f)=>n+f.bytes,0))}</small></span></div></div>
          <div className="section-heading"><h2><FolderOpen size={20}/>{date?'번지별 일정 폴더':region?'조사 날짜 폴더':'지역 폴더'} <span>{date?scoped.length:region?dates.length:regions.length}</span></h2><button className="subtle-button" onClick={()=>refresh(null)} disabled={loading}><RefreshCw size={15} className={loading?'spin':''}/>새로고침</button></div>
          {loading&&!folders.length?<div className="loading-block" role="status">일정과 사진 보관함을 불러오고 있어요.</div>:!date?<div className="folder-grid">{(region?dates:regions).map(value=>{const items=scoped.filter(f=>region?f.date===value:f.region===value);return <button className="folder-card hierarchy-card" key={value} onClick={()=>region?location(region,value):location(value)}><div className="folder-card-top"><FolderIcon className="folder-symbol" size={46} strokeWidth={1.35}/><ChevronRight size={18}/></div><h3>{value}</h3><p>{region?`${items.length}개 일정`:`${new Set(items.map(f=>f.date)).size}개 조사 날짜`}</p><div className="folder-card-bottom"><span><ImageIcon size={15}/>{items.reduce((n,f)=>n+f.count,0)}장의 사진</span><span>폴더 열기</span></div></button>;})}</div>:[...new Set(scoped.map(f=>f.group))].map(group=><section className="schedule-group" key={group}><div className="group-label">일정 그룹 {group}<span>{scoped.filter(f=>f.group===group).length}개 폴더</span></div><div className="folder-grid">{scoped.filter(f=>f.group===group).map(f=><button className="folder-card" key={f.id} onClick={()=>navigate(f.id)}><div className="folder-card-top"><FolderIcon className="folder-symbol" size={42} strokeWidth={1.35}/>{f.time&&<span className="time-pill"><Clock size={13}/>{f.time}</span>}</div><h3>{f.lot}</h3>{f.unit&&<p className="unit-label">{f.unit}</p>}<p>{f.address||'일정별 현장 사진'}</p>{f.surveyStatus&&f.surveyStatus!=='미완료'&&<span className="survey-status">{f.surveyStatus}</span>}<div className="folder-card-bottom"><span><ImageIcon size={15}/>{f.count?`${f.count}장의 사진`:'사진 없음'}</span>{f.warning?<span className="warning-label">2인 방문</span>:<ChevronRight size={17}/>}</div></button>)}</div></section>)}
        </>}
        {active&&<><button className="back-button" disabled={uploading} onClick={()=>navigate(null)}><ArrowLeft size={16}/>해당 날짜 일정</button><section className="site-details"><div><span className="detail-label"><Clock size={14}/>방문 시간</span><strong>{active.time}</strong></div><div><span className="detail-label"><UserRound size={14}/>연락 대상</span><strong>{active.name}</strong><div className="phone-list">{active.phones.map(p=><a key={p} href={'tel:'+p}><Phone size={13}/>{p}</a>)}</div></div><div className="visit-note"><span className="detail-label"><TriangleAlert size={14}/>조사 메모</span><p>{active.notes}</p></div></section>
          <FolderRemarks key={active.id} folder={active} onDirty={setRemarksDirty} onSaved={()=>refresh(selected,true)}/><div className="section-heading"><h2><ImageIcon size={20}/>현장 사진 <span>{active.count}</span></h2><button className="subtle-button" disabled={uploading||loading||!!error} onClick={()=>setExportScope(active.id)}><ArrowDownToLine size={16}/>이 폴더 다운로드</button></div>
          <div className={'upload-zone'+(dragging?' drag-active':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!uploading)void upload(Array.from(e.dataTransfer.files));}}>
            <span className="upload-icon"><CloudUpload size={28}/></span><div className="upload-copy"><h3>{uploading?'원본 사진을 저장하고 있어요':'이 번지의 현장 사진을 넣어주세요'}</h3><p>{uploading?'저장이 끝날 때까지 이 화면을 열어두세요.':'여러 장 선택하거나 여기에 끌어다 놓으세요. 한 장당 최대 20MB.'}</p></div><div className="upload-actions"><BatchCamera key={active.id} disabled={uploading||folderDeleteBusy} progress={progress} onUpload={files=>upload(files,true)} onPendingChange={setCameraPending}/><button className="primary-button" disabled={uploading} onClick={()=>input.current?.click()}><CloudUpload size={17}/>사진 추가</button></div>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif" multiple hidden onChange={e=>void upload(Array.from(e.target.files||[]))}/>
            {uploading&&<div className="upload-progress"><Progress value={progress.total?progress.done/progress.total*100:0}/><span>{progress.done} / {progress.total}장 처리</span></div>}
          </div>
          {failed.length>0&&<div className="error-banner"><TriangleAlert size={18}/><div><strong>{failed.length}장 저장 실패</strong><p>{failed.map(f=>f.name).join(', ')}</p></div><button onClick={()=>upload(failed)}>실패한 사진 다시 올리기</button></div>}
          {loading?<div className="loading-block" role="status">사진을 불러오는 중…</div>:photos.length?<div className="photo-grid">{photos.map(photo=><article className="photo-card" key={photo.id}><button className="photo-image" onClick={()=>setPreview(photo)} aria-label={photo.filename+' 크게 보기'}>{photo.content_type==='image/heic'?<div className="heic-placeholder"><ImageIcon size={34}/><span>HEIC 원본</span></div>:<img src={'/api/photos/'+photo.id} alt={photo.filename} loading="lazy"/>}</button><div className="photo-meta"><strong title={photo.filename}>{photo.filename}</strong><span>{dateText(photo.created_at)} · {formatBytes(photo.size)}</span><div className="photo-actions"><a href={'/api/photos/'+photo.id+'?download=1'} download aria-label={photo.filename+' 다운로드'}><ArrowDownToLine size={16}/></a><button disabled={uploading} onClick={()=>setDeleting(photo)} aria-label={photo.filename+' 삭제'}><Trash2 size={16}/></button></div></div></article>)}</div>:!error&&<div className="empty-photos"><ImageIcon size={36} strokeWidth={1.2}/><h3>아직 보관한 사진이 없어요</h3><p>추가한 사진은 이 폴더에 원본으로 저장됩니다.</p></div>}
        </>}
        <footer className="workspace-footer"><span><LockKeyhole size={13}/>로그인한 팀원이 함께 사용하는 보관함</span><span>{userName} {isAdmin&&<a href="/account/setup">계정 설정</a>} <button className="subtle-button" disabled={uploading||remarksDirty||cameraPending} onClick={async()=>{try{const r=await fetch('/api/session',{method:'DELETE'});if(!r.ok)throw new Error();window.location.assign('/');}catch{toast.error('로그아웃하지 못했습니다. 다시 시도해 주세요.');}}}>로그아웃</button></span></footer>
      </main>
    </div>
    <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="photo-dialog"><DialogHeader><DialogTitle>{preview?.filename}</DialogTitle><DialogDescription>원본 사진 · {preview&&formatBytes(preview.size)}</DialogDescription></DialogHeader>{preview&&(preview.content_type==='image/heic'?<p>이 브라우저에서는 HEIC 미리보기를 지원하지 않을 수 있어요. 원본을 내려받아 확인해 주세요.</p>:<img className="large-preview" src={'/api/photos/'+preview.id} alt={preview.filename}/>)}{preview&&<a className="secondary-button" href={'/api/photos/'+preview.id+'?download=1'} download><ArrowDownToLine size={17}/>원본 다운로드</a>}</DialogContent></Dialog>
    <Dialog open={exportScope!==undefined} onOpenChange={open=>{if(!open)setExportScope(undefined);}}><DialogContent><DialogHeader><DialogTitle>폴더 그대로 다운로드</DialogTitle><DialogDescription>현재 선택한 폴더부터 시작하는 ZIP 파일로 받습니다. 완료 후에도 다시 다운로드할 수 있습니다.</DialogDescription></DialogHeader><div className="export-summary"><Archive size={30}/><div><strong>{(exportFolder?folderLabel(exportFolder):'')||[region,date].filter(Boolean).join(' / ')||'모든 지역과 날짜'}</strong><p>{exportItems.length}개 일정 폴더 · {exportItems.reduce((n,f)=>n+f.count,0)}장 · {formatBytes(exportItems.reduce((n,f)=>n+f.bytes,0))}</p></div></div><div className="export-path"><FolderIcon size={17}/>{exportFolder?'건물(호수 또는 지번 주소) / 사진':'조사 날짜 / 건물(호수 또는 지번 주소) / 사진'}</div><p className="export-help">구분건물은 호수만(예: 301호), 일반건물은 지번 주소로 폴더를 만듭니다. 이름이 겹치면 번호를 붙입니다. 빈 폴더도 포함합니다. 같은 이름의 사진은 고유번호를 붙여 모두 보존합니다. 다운로드 완료 여부는 브라우저 다운로드 목록에서 확인해 주세요.</p><ArchiveDownload name={exportFolder?exportFolderLabel(exportFolder):date||region||'현장사진_전체'} query={exportQuery} onComplete={()=>void refresh(selected,true)}/></DialogContent></Dialog>
    <ImportSchedule open={importing} manual={manualImport} initialRegion={region||''} initialDate={date||''} onClose={()=>setImporting(false)} onSaved={(r,d)=>{setImporting(false);location(r,d);void refresh(null);}}/>
    <AlertDialog open={folderDelete} onOpenChange={open=>{if(!folderDeleteBusy)setFolderDelete(open);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 폴더를 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{active?folderLabel(active):[region,date].filter(Boolean).join(' / ')}<br/>{active?1:scoped.length}개 일정 폴더 · {active?active.count:scoped.reduce((n,f)=>n+f.count,0)}장의 사진이 영구 삭제됩니다. {!active&&'이 범위의 일정표 원본도 함께 삭제됩니다.'} 마지막 건물 폴더를 삭제하면 해당 날짜의 일정표 원본도 함께 삭제됩니다. 삭제한 자료는 복구할 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={folderDeleteBusy}>취소</AlertDialogCancel><AlertDialogAction disabled={folderDeleteBusy} onClick={e=>{e.preventDefault();void removeFolder();}}>{folderDeleteBusy?'삭제 중…':'폴더와 자료 삭제'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!deleteBusy)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 사진을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{deleting?.filename}<br/>보관함에서 원본이 영구 삭제되며 휴대폰과 PC 모두에서 사라집니다. 기기에 있는 사진은 삭제되지 않습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>취소</AlertDialogCancel><AlertDialogAction disabled={deleteBusy} onClick={e=>{e.preventDefault();void removePhoto();}}>{deleteBusy?'삭제 중…':'사진 삭제'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
