"use client";
import Link from 'next/link';
import {PendingUploads} from './pending-uploads';
import {StorageSettings} from './storage-settings';
import {BackupTools} from './backup-tools';
import {savePending,deletePending} from '@/lib/pending-uploads';
import {uploadId} from '@/lib/upload-id';
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {Pencil,Plus,Archive,ArrowLeft,ArrowDownToLine,Camera,Check,ChevronRight,Clock,CloudUpload,Folder as FolderIcon,FolderOpen,Image as ImageIcon,LockKeyhole,MapPin,Phone,RefreshCw,TriangleAlert,Trash2,UserRound,MoreHorizontal,ChevronDown,FileText} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Progress} from '@/components/ui/progress';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';
import {addressParts,addressNodes,matchingAddress,withinAddress} from '@/lib/address-folders';
import {folderLabel,type Folder,type Photo} from '@/lib/types';
import {FolderRemarks,DailyReportButton} from './report-tools';
import {ImportSchedule} from './import-schedule';
import {EditSchedule} from './edit-schedule';
import {registerPhotoTools} from '@/lib/webmcp';
import type {BudgetUsage} from '@/lib/r2-budget';
import {exportFolderLabel} from '@/lib/daily-report';
import {FolderSearch} from './folder-search';
import {BulkFolderDelete} from './bulk-folder-delete';
import {searchFolders} from '@/lib/folder-search';
import {MapDirections} from './map-directions';
import {BatchCamera} from './batch-camera';
import {uploadPhotos} from '@/lib/photo-upload';
import {useUploadPreviews} from './use-upload-previews';
const DrawingEditor=lazy(()=>import('./drawing-editor').then(m=>({default:m.DrawingEditor})));
import {ArchiveDownload} from './archive-download';

const formatBytes=(n:number)=>n>=1024**3?`${(n/1024**3).toFixed(1)} GB`:n>=1024**2?`${(n/1024**2).toFixed(1)} MB`:`${Math.ceil(n/1024)} KB`;
const dateText=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export default function Workspace({userName,isAdmin=false,storageScope}:{userName:string;isAdmin?:boolean;storageScope:string}){
  useEffect(registerPhotoTools,[]);
  const [drawingPhoto,setDrawingPhoto]=useState<Photo|null>(null);
  const [mediaKind,setMediaKind]=useState<'photo'|'drawing'>('photo');
  const [cameraPending,setCameraPending]=useState(false);
  const [folderDelete,setFolderDelete]=useState(false),[folderDeleteBusy,setFolderDeleteBusy]=useState(false);
  const [manualImport,setManualImport]=useState(false);
  const [editingSchedule,setEditingSchedule]=useState<Folder|null>(null);
  const scheduleLocation=useRef('');
  const [remarksDirty,setRemarksDirty]=useState(false);
  const [region,setRegion]=useState<string|null>(null),[date,setDate]=useState<string|null>(null),[importing,setImporting]=useState(false);
  const [searchQuery,setSearchQuery]=useState('');
  const [folderPane,setFolderPane]=useState<'photos'|'record'|'map'>('photos');
  const [actionPanel,setActionPanel]=useState<'add'|'more'|null>(null);
  const [view,setView]=useState<'date'|'address'>('date');
  const [addressPath,setAddressPath]=useState<string[]>([]);
  const [folders,setFolders]=useState<Folder[]>([]),[photos,setPhotos]=useState<Photo[]>([]);
  const [usage,setUsage]=useState<BudgetUsage|null>(null);
  const [selected,setSelected]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const uploadPreviews=useUploadPreviews(view+':'+(selected||''));
  const pendingPhotos=uploadPreviews.items.filter(item=>item.folder===selected&&item.kind===mediaKind&&!item.photo);
  const localPhotos=new Map(uploadPreviews.items.filter(item=>item.photo).map(item=>[item.photo!.id,item]));
  const [uploading,setUploading]=useState(false),[progress,setProgress]=useState({done:0,total:0}),[failed,setFailed]=useState<File[]>([]);
  const [preview,setPreview]=useState<Photo|null>(null),[deleting,setDeleting]=useState<Photo|null>(null),[deleteBusy,setDeleteBusy]=useState(false);
  const [exportScope,setExportScope]=useState<string|null|undefined>(undefined),[dragging,setDragging]=useState(false);
  const input=useRef<HTMLInputElement>(null),sequence=useRef(0),uploadLock=useRef(false),activeUpload=useRef<AbortController|null>(null);
  const folderDates=new Map(folders.map(f=>[f.id,f.date]));
  const visiblePhotos=photos.filter(photo=>(photo.kind||'photo')===mediaKind);
  const mediaLabel=mediaKind==='drawing'?'도면 사진':'현장 사진';
  const active=folders.find(f=>f.id===selected), total=folders.reduce((n,f)=>n+f.count,0),bytes=folders.reduce((n,f)=>n+f.bytes,0);
  type Library={error?:string;folders:Folder[];photos:Photo[];usage:BudgetUsage;nextCursor?:string|null;forecast?:{dailyBytes:number;daysRemaining:number|null}};
  const [nextCursor,setNextCursor]=useState<string|null>(null),[pageBusy,setPageBusy]=useState(false),[forecast,setForecast]=useState<Library['forecast']>();
  const metadata=useRef<{at:number;data:Library}|null>(null);
  const snapshots=useRef(new Map<string,{at:number;data:Library}>()),lastRefresh=useRef(0),pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>{pending.current?.abort();activeUpload.current?.abort();},[]);
  const refresh=useCallback(async(folder:string|null,quiet=false,reuse=false)=>{
    const seq=++sequence.current,key=view+':'+mediaKind+':'+(folder||''),cached=reuse?snapshots.current.get(key):undefined;
    pending.current?.abort();
    if(!reuse){snapshots.current.clear();metadata.current=null;}
    if(cached){setFolders(cached.data.folders);setPhotos(cached.data.photos);setUsage(cached.data.usage);setNextCursor(cached.data.nextCursor||null);setForecast(cached.data.forecast);setLoading(false);setError('');if(Date.now()-cached.at<60000)return;}
    if(!quiet&&!cached)setLoading(true);
    const controller=new AbortController();pending.current=controller;
    try{
      const read=async(url:string)=>{const r=await fetch(url,{cache:'no-store',signal:controller.signal}),data=await r.json() as Library;if(!r.ok){if(r.status===401){snapshots.current.clear();metadata.current=null;setPhotos([]);setFolders([]);}throw Error(data.error||'불러오지 못했습니다.');}return data;};
      const [info,page]=await Promise.all([metadata.current&&Date.now()-metadata.current.at<30000?Promise.resolve(metadata.current.data):read('/api/library'),folder?read('/api/library?'+new URLSearchParams({folder,view,kind:mediaKind,photosOnly:'1',limit:'60'})):Promise.resolve({photos:[],nextCursor:null})]);
      if(seq===sequence.current){const data:Library={...info,...page};metadata.current={at:Date.now(),data:info};
        snapshots.current.delete(key);snapshots.current.set(key,{at:Date.now(),data});while(snapshots.current.size>20)snapshots.current.delete(snapshots.current.keys().next().value!);
        lastRefresh.current=Date.now();setFolders(data.folders);setPhotos(data.photos);setUsage(data.usage);setNextCursor(data.nextCursor||null);setForecast(data.forecast);setError('');}
    }
    catch(e){if(seq===sequence.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}
    finally{if(seq===sequence.current)setLoading(false);}
  },[view,mediaKind]);
  // Hash navigation and cached network state are synchronized at this external boundary.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{setFolderPane(window.matchMedia('(min-width: 1024px)').matches?'record':'photos');setPhotos([]);setNextCursor(null);setFailed([]);void refresh(selected,false,true);},[selected,refresh]);
  useEffect(()=>{const update=()=>{if(!uploading && photos.length<=60 && document.visibilityState==='visible'&&Date.now()-lastRefresh.current>=30000)void refresh(selected,true);};window.addEventListener('focus',update);const timer=setInterval(update,60000);return()=>{window.removeEventListener('focus',update);clearInterval(timer);};},[selected,refresh,uploading,photos.length]);
  useEffect(()=>{if(!uploading&&!remarksDirty&&!cameraPending&&!folderDeleteBusy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uploading,remarksDirty,cameraPending,folderDeleteBusy]);

  async function loadMore(){if(!selected||!nextCursor||pageBusy)return;const seq=sequence.current;setPageBusy(true);try{const r=await fetch('/api/library?'+new URLSearchParams({folder:selected,view,kind:mediaKind,photosOnly:'1',limit:'60',cursor:nextCursor}),{cache:'no-store'});const data=await r.json() as Library;if(!r.ok)throw Error(data.error||'사진을 더 읽지 못했습니다.');if(seq===sequence.current){setPhotos(previous=>[...previous,...data.photos.filter((p:Photo)=>!previous.some(old=>old.id===p.id))]);setNextCursor(data.nextCursor||null);}}catch(e){toast.error(e instanceof Error?e.message:'사진 조회 실패');}finally{setPageBusy(false);}}

  async function upload(files:File[],fromCamera=false):Promise<File[]>{
    if(!selected||uploadLock.current||folderDeleteBusy||!files.length)return files;
    uploadLock.current=true;const uploadTask=new AbortController();activeUpload.current=uploadTask;
    const target=selected,kind=mediaKind;setUploading(true);setFailed([]);setProgress({done:0,total:files.length});
    pending.current?.abort();sequence.current++;setLoading(false);
    try{
      await savePending(storageScope,target,kind,files).catch(()=>toast.warning('이 기기에 임시 보관하지 못했습니다. 서버 저장이 끝날 때까지 화면을 열어 두세요. 실패한 사진은 원본을 내려받아 보관할 수 있습니다.'));
      const entries=uploadPreviews.begin(files,target,kind);
      const result=await uploadPhotos(files,target,kind,{
        signal:uploadTask.signal,
        onStart:(_file,index)=>uploadPreviews.patch(entries[index].key,{status:'uploading'}),
        onSaved:async(file,photo,index,elapsedMs)=>{
          uploadPreviews.patch(entries[index].key,{status:'saved',photo,elapsedMs});
          await deletePending(storageScope,uploadId(file)).catch(()=>toast.warning('서버 저장은 완료됐지만 기기 임시 보관을 정리하지 못했습니다. 미전송 목록에서 재확인해 주세요.'));
          setPhotos(previous=>[photo,...previous.filter(item=>item.id!==photo.id)]);
          setFolders(previous=>previous.map(folder=>folder.id===target?{...folder,count:folder.count+1,bytes:folder.bytes+photo.size}:folder));
        },
        onProgress:(done,total)=>setProgress({done,total}),
        onError:(file,error,index)=>{uploadPreviews.patch(entries[index].key,{status:'failed',error:error.message});if(error.name!=='AbortError')toast.error(`${file.name}: ${error.message}`);},
      });
      setFailed(fromCamera?[]:result.failed);
      if(fromCamera)uploadPreviews.remove(item=>item.status==='failed');
      void refresh(target,true);
      if(result.saved)toast.success(`${result.saved}장 저장 완료`);
      return result.failed;
    }catch(e){toast.error(e instanceof Error?e.message:'사진을 임시 보관하지 못했습니다.');setFailed(fromCamera?[]:files);return files;}finally{
      if(input.current)input.current.value='';
      activeUpload.current=null;uploadLock.current=false;setUploading(false);
    }
  }
  async function removePhoto(){if(!deleting)return;setDeleteBusy(true);try{
    const r=await fetch('/api/library?id='+encodeURIComponent(deleting.id),{method:'DELETE'});const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error);
    uploadPreviews.remove(item=>item.photo?.id===deleting.id);
    if(preview?.id===deleting.id)setPreview(null);
    toast.success('사진을 삭제했어요.');setDeleting(null);await refresh(selected,true);
  }catch(e){toast.error(e instanceof Error?e.message:'삭제하지 못했습니다.');}finally{setDeleteBusy(false);}}
  const exportFolder=folders.find(f=>f.id===exportScope);
  const baseFolders=folders.filter(f=>(!region||f.region===region)&&(view==='address'||!date||f.date===date));
  const scoped=view==='address'?baseFolders.filter(f=>withinAddress(f,addressPath,true)):baseFolders;
  const nodes=view==='address'?addressNodes(baseFolders,addressPath,true):baseFolders.map(f=>({key:f.id,label:folderLabel(f),folders:[f],leaf:true}));
  useEffect(()=>{
    if(view!=='address'||!addressPath.length||addressPath[0].startsWith('category:')||!folders.length)return;
    const match=folders.find(f=>(!region||f.region===region)&&withinAddress(f,addressPath));
    if(!match)return;
    const path=[addressParts(match,true)[0].key,...addressPath];
    // Migrate a legacy browser URL once after its folder metadata arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddressPath(path);
    const q=new URLSearchParams(window.location.hash.slice(1));q.set('path',JSON.stringify(path));window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search+'#'+q.toString());
  },[view,addressPath,folders,region]);
  const pathLabels=(view==='address'?addressPath:[]).map((key,i)=>addressParts(scoped[0]||baseFolders.find(f=>withinAddress(f,addressPath.slice(0,i+1),view==='address'))||{id:'',region:'',lot:'',address:''},view==='address')[i]?.label||(key==='@whole'?'건물 전체·호수 미입력':'주소'));
  const related=active?(view==='address'?matchingAddress(baseFolders,active):[active]).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)):[];
  const regions=[...new Set(folders.map(f=>f.region))];
  const dates=[...new Set(scoped.map(f=>f.date))].sort().reverse();
  const deleteGroups=active?[{key:active.id,label:folderLabel(active),folders:related}]:searchQuery.trim()?searchFolders(scoped,searchQuery,view,addressPath).map(g=>({key:JSON.stringify([g.folder.region,g.path]),label:g.folder.region+' · '+g.label+(view==='date'?' · '+g.folder.date:''),folders:g.folders})):region&&(view==='address'||date)?nodes.map(n=>({key:n.key,label:n.label,folders:n.folders})):(region?dates:regions).map(value=>({key:value,label:value,folders:scoped.filter(f=>region?f.date===value:f.region===value)}));

  const exportQuery=new URLSearchParams(exportFolder?{folder:exportFolder.id}:region?date?{region,date}:{region}:{});
  exportQuery.set('view',view);if(view==='address'&&addressPath.length)exportQuery.set('path',JSON.stringify(addressPath));
  const exportItems=exportFolder?(view==='address'?matchingAddress(baseFolders,exportFolder):[exportFolder]):scoped;
  const navigationGuard=useRef({uploading:false,remarksDirty:false,folderDeleteBusy:false,cameraPending:false,editingSchedule:false,scheduleUrl:''});
  navigationGuard.current={uploading,remarksDirty,folderDeleteBusy,cameraPending,editingSchedule:!!editingSchedule,scheduleUrl:scheduleLocation.current};
  const historyPosition=useRef<{index:number;parents:number[]}>({index:0,parents:[]});
  function locationUrl(r:string|null,d:string|null,id:string|null,path:string[]=[],mode=view){const q=new URLSearchParams({view:mode});if(r)q.set('region',r);if(d&&mode==='date')q.set('date',d);if(id)q.set('folder',id);if(path.length)q.set('path',JSON.stringify(path));return window.location.pathname+window.location.search+'#'+q.toString();}
  useEffect(()=>{
    const restore=()=>{setMediaKind('photo');setSearchQuery('');historyPosition.current=window.history.state?.hanaNavigation||{index:0,parents:[]};const q=new URLSearchParams(window.location.hash.slice(1));const mode=q.get('view')==='address'?'address':'date';setView(mode);setRegion(q.get('region'));setDate(mode==='date'?q.get('date'):null);setSelected(q.get('folder'));let path:string[]=[];try{const v=JSON.parse(q.get('path')||'[]');if(Array.isArray(v)&&v.length<=4&&v.every(x=>typeof x==='string'))path=v;}catch{}setAddressPath(mode==='address'?path:[]);setPreview(null);setExportScope(undefined);setImporting(false);setEditingSchedule(null);setFolderDelete(false);setRemarksDirty(false);};
    const pop=()=>{const old=historyPosition.current,next=window.history.state?.hanaNavigation as typeof old|undefined,g=navigationGuard.current;
      if(g.editingSchedule){window.history.replaceState({...window.history.state,hanaNavigation:old},'',g.scheduleUrl);return;}
      if(next&&next.index!==old.index&&(g.uploading||g.folderDeleteBusy||(g.remarksDirty&&!window.confirm('저장하지 않은 비고를 버리고 이동할까요?'))||(g.cameraPending&&!window.confirm('아직 업로드하지 않은 촬영 사진을 버리고 이동할까요?')))){window.history.go(old.index-next.index);return;}restore();};
    if(!window.history.state?.hanaNavigation)window.history.replaceState({...window.history.state,hanaNavigation:{index:0,parents:[]}},'');
    restore();window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
  },[]);
  function location(r:string|null,d:string|null=null,id:string|null=null,path:string[]=[],mode=view){
    if(uploading||folderDeleteBusy)return;if(remarksDirty){toast.info('비고를 저장한 뒤 이동해 주세요.');return;}
    if(cameraPending&&!window.confirm('아직 업로드하지 않은 촬영 사진을 버리고 이동할까요?'))return;
    if(mode==='address')d=null;else path=[];
    const url=locationUrl(r,d,id,path,mode);if(url===window.location.pathname+window.location.search+window.location.hash)return;
    const position={index:historyPosition.current.index+1,parents:[]};window.history.pushState({...window.history.state,hanaNavigation:position},'',url);historyPosition.current=position;
    setMediaKind('photo');setSearchQuery('');setView(mode);setAddressPath(path);setRegion(r);setDate(d);setSelected(id);setPreview(null);setExportScope(undefined);window.scrollTo({top:0,behavior:'smooth'});
  }
  function parentLocation(){if(addressPath.length)location(region,date,null,addressPath.slice(0,-1));else if(selected)location(region,date);else if(date)location(region);else location(null);}
  async function removeFolder(){
    if(!region||folderDeleteBusy)return;setFolderDeleteBusy(true);
    const query=new URLSearchParams(active?{id:active.id}:date?{region,date}:{region});
    try{let continuation:unknown=undefined;for(;;){const response=await fetch('/api/folders?'+query,{method:'DELETE',headers:continuation?{'Content-Type':'application/json'}:undefined,body:continuation?JSON.stringify(continuation):undefined});const result=await response.json() as {error?:string;deleted:boolean;continuation?:unknown};if(!response.ok)throw new Error(result.error||'폴더를 삭제하지 못했습니다. 같은 삭제 버튼으로 다시 시도해 주세요.');if(result.deleted)break;continuation=result.continuation;if(!continuation)throw new Error('삭제 진행을 확인하지 못했습니다. 다시 시도해 주세요.');}
      const next=active?{r:region,d:date}:date?{r:region,d:null}:{r:null,d:null};
      setFolderDeleteBusy(false);navigationGuard.current.folderDeleteBusy=false;setSelected(null);setRegion(next.r);setDate(next.d);setAddressPath([]);window.history.replaceState(window.history.state,'',locationUrl(next.r,next.d,null));setFolderDelete(false);setRemarksDirty(false);await refresh(null,true);toast.success('폴더와 포함된 자료를 삭제했습니다.');
    }catch(e){toast.error(e instanceof Error?e.message:'삭제하지 못했습니다. 다시 시도해 주세요.');await refresh(selected,true);}finally{setFolderDeleteBusy(false);}
  }


  return <div className="app-shell">
    <Toaster richColors position="top-center" theme="light"/>
    <header className="app-header"><Link prefetch={false} href="/" className="brand" aria-label="HANA 홈"><span className="brand-mark"><FolderOpen size={23}/></span><span>HANA<span className="brand-caption">현장 기록</span></span></Link><div className="private-label"><LockKeyhole size={14}/>팀 공용 보관함</div></header>
    <div className="workspace-layout">
      <aside className="project-panel"><div className="panel-label">조사 프로젝트</div><button className="date-nav" disabled={uploading} onClick={()=>location(null)}><FolderOpen size={19}/><span>전체 지역</span><span className="nav-count">{regions.length}</span></button><div className="folder-index">{regions.map(r=><div key={r}><button className={region===r?'index-item active':'index-item'} disabled={uploading} onClick={()=>location(r)}><FolderIcon size={16}/><span>{r}</span></button>{view==='date'&&region===r&&[...new Set(folders.filter(f=>f.region===r).map(f=>f.date))].sort().reverse().map(d=><button key={d} className={date===d?'index-item active date-index':'index-item date-index'} disabled={uploading} onClick={()=>location(r,d)}><span>{d}</span><span>{folders.filter(f=>f.region===r&&f.date===d).length}</span></button>)}</div>)}</div><button className="secondary-button" disabled={uploading||remarksDirty||cameraPending} onClick={()=>{setManualImport(false);setImporting(true);}}><CloudUpload size={17}/>일정표 사진 등록</button><div className="sidebar-bottom"><LockKeyhole size={16}/><div><strong>비공개 원본 보관</strong><p>공용 계정으로 PC와 휴대폰에서<br/>함께 사진을 관리합니다.</p></div></div></aside>
      <main className="main-workspace">
        {region&&<button className="back-button" disabled={uploading||folderDeleteBusy} onClick={parentLocation}><ArrowLeft size={16}/>상위 폴더로</button>}
        <nav aria-label="현재 위치" className="breadcrumb"><button disabled={uploading} onClick={()=>location(null)}>전체 지역</button>{region&&<><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region)}>{region}</button></>}{date&&<><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region,date)}>{date}</button></>}{pathLabels.map((label,i)=><span key={i} style={{display:'contents'}}><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region,date,i===addressPath.length-1?selected:null,addressPath.slice(0,i+1))}>{label}</button></span>)}{active&&!addressPath.length&&<><ChevronRight size={14}/><span>{folderLabel(active)}</span></>}</nav>
        <section className="page-heading"><div className="page-title"><div className="eyebrow">{active?[region,active.date].filter(Boolean).join(' · '):region||'HANA WORKSPACE'}</div><h1>{active?pathLabels.at(-1)||folderLabel(active):pathLabels.at(-1)||(date?`${date} 현장조사`:region||'현장조사 보관함')}</h1><p>{active?active.address:date?'조사할 주소를 선택해 사진과 기록을 관리하세요.':'구역과 주소로 현장 기록을 빠르게 찾아보세요.'}</p></div><div className="heading-actions">{active&&<button className="secondary-button" disabled={loading||uploading||remarksDirty||cameraPending||folderDeleteBusy} onClick={()=>{scheduleLocation.current=window.location.pathname+window.location.search+window.location.hash;setEditingSchedule(active);}}><Pencil size={17}/>일정 수정</button>}{!active&&<button className="primary-button" disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>setActionPanel('add')}><Plus size={18}/>일정 추가</button>}<button className="secondary-button download-priority desktop-workspace-action" onClick={()=>setExportScope(active?.id??null)} disabled={loading||uploading||!!error}><ArrowDownToLine size={17}/>다운로드</button><button className="secondary-button mobile-workspace-action schedule-photo-action" disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>{setManualImport(false);setImporting(true);}}><CloudUpload size={17}/>일정표 사진등록</button><button className="secondary-button icon-button" aria-label="폴더 더보기" disabled={uploading||cameraPending} onClick={()=>setActionPanel('more')}><MoreHorizontal size={20}/></button></div></section>
        {!active&&<div className="browse-toolbar"><div className="view-switch" role="group" aria-label="폴더 보기 방식">{(['date','address'] as const).map(mode=><button key={mode} aria-pressed={view===mode} disabled={uploading||remarksDirty||cameraPending} onClick={()=>location(region,null,null,[],mode)}>{mode==='date'?'날짜별 보기':'주소별 모아보기'}</button>)}</div></div>}
        {active&&<section className="mobile-visit-summary" aria-label="현장 핵심 정보"><div><span><Clock size={14}/>{active.time||'시간 미정'}</span><strong>{active.name||'연락 대상 미입력'}</strong><span className="visit-status">{active.surveyStatus||'미완료'}</span></div>{active.phones.length>0&&<div className="phone-list">{active.phones.map(p=><a key={p} href={'tel:'+p}><Phone size={14}/>{p}</a>)}</div>}{active.notes&&<div className="visit-notice"><strong>방문 전 확인사항</strong><p>{active.notes}</p></div>}</section>}
        {active&&<div className="folder-pane-nav" role="group" aria-label="폴더 작업 선택">{([{id:'photos',label:'사진',icon:ImageIcon},{id:'record',label:'조사 정보',icon:FileText},{id:'map',label:'길찾기',icon:MapPin}] as const).map(pane=><button key={pane.id} aria-pressed={folderPane===pane.id} disabled={uploading||cameraPending} onClick={()=>setFolderPane(pane.id)}><pane.icon size={18}/>{pane.label}</button>)}</div>}
        {active&&folderPane==='map'&&<MapDirections folder={active}/>}
        {!active&&view==='address'&&addressPath.length>=2&&scoped.length>0&&<details className="building-directions" key={addressPath.join('/')}><summary><MapPin size={17}/>이 건물 길찾기<ChevronDown size={16}/></summary><MapDirections folder={scoped[0]}/></details>}
        {!selected&&<div className="bulk-delete-toolbar"><BulkFolderDelete groups={deleteGroups} disabled={loading||uploading||remarksDirty||cameraPending||folderDeleteBusy||!!error} onBusy={setFolderDeleteBusy} onDone={()=>refresh(selected,true)}/></div>}
        {!active&&!selected&&<FolderSearch folders={scoped} query={searchQuery} onQuery={setSearchQuery} view={view} path={addressPath} onOpen={(f,path,leaf)=>location(f.region,view==='date'?f.date:null,leaf?f.id:null,path)}/>}
        {error&&<div className="error-banner" role="alert"><TriangleAlert size={19}/><span>{error}</span><button onClick={()=>refresh(selected)}>다시 시도</button></div>}
        {usage&&(usage.storageBytes>=usage.storageLimit||usage.writes>=usage.writeLimit||usage.reads>=usage.readLimit)&&<div className="error-banner" role="status">보관함 사용 한도에 도달했습니다. 화면 아래 ‘보관함 사용량’에서 자세한 내용을 확인하세요.</div>}
        {!active&&!selected&&<><div className="overview-strip"><div><span>조사 일정</span><strong>{scoped.length}<small>곳</small></strong></div><div><span>사진 있는 폴더</span><strong>{scoped.filter(f=>f.count>0).length}<small>/ {scoped.length}</small></strong></div><div><span>보관한 사진</span><strong>{scoped.reduce((n,f)=>n+f.count,0)}<small>장</small></strong></div><div className="storage-stat"><CloudUpload size={20}/><span>원본 저장<small>{formatBytes(scoped.reduce((n,f)=>n+f.bytes,0))}</small></span></div></div>
          {!searchQuery.trim()&&<><div className="section-heading"><h2><FolderOpen size={20}/>{region&&(view==='address'||date)?'주소 폴더':region?'조사 날짜 폴더':'지역 폴더'} <span>{region&&(view==='address'||date)?nodes.length:region?dates.length:regions.length}</span></h2><button className="subtle-button" onClick={()=>refresh(null)} disabled={loading}><RefreshCw size={15} className={loading?'spin':''}/>새로고침</button></div>
          {loading&&!folders.length?<div className="loading-block" role="status">일정과 사진 보관함을 불러오고 있어요.</div>:region&&(view==='address'||date)?<div className="folder-grid">{nodes.map(node=><button className="folder-card hierarchy-card" key={node.key} onClick={()=>{const path=[...addressPath,node.key];const first=[...node.folders].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))[0];location(region,date,node.leaf?first.id:null,path);}}><div className="folder-card-top"><FolderIcon className="folder-symbol" size={46} strokeWidth={1.35}/><ChevronRight size={18}/></div><h3>{node.label}</h3><p>{node.leaf?'현장 사진':`${addressNodes(node.folders,[...addressPath,node.key],view==='address').length}개 하위 폴더`}</p><div className="folder-card-bottom"><span><ImageIcon size={15}/>{node.folders.reduce((n,f)=>n+f.count,0)}장의 사진</span><span>폴더 열기</span></div></button>)}{!nodes.length&&<p>이 주소에 등록된 일정이 없습니다.</p>}</div>:<div className="folder-grid">{(region?dates:regions).map(value=>{const items=scoped.filter(f=>region?f.date===value:f.region===value);return <button className="folder-card hierarchy-card" key={value} onClick={()=>region?location(region,value):location(value)}><div className="folder-card-top"><FolderIcon className="folder-symbol" size={46} strokeWidth={1.35}/><ChevronRight size={18}/></div><h3>{value}</h3><p>{items.length}개 일정</p><div className="folder-card-bottom"><span><ImageIcon size={15}/>{items.reduce((n,f)=>n+f.count,0)}장의 사진</span><span>폴더 열기</span></div></button>;})}</div>}

          </>}
        </>}
        {active&&<>{related.length>1&&<label className="section-heading">업로드·조사 메모를 저장할 일정 <select aria-label="업로드·조사 메모를 저장할 일정" value={active.id} disabled={uploading||remarksDirty||cameraPending} onChange={e=>location(region,date,e.target.value,addressPath)}>{related.map(f=><option key={f.id} value={f.id}>{f.date} · {f.time} · {f.name||f.lot}</option>)}</select></label>}{view==='address'&&<p className="scope-note">모든 날짜의 사진 · 새 기록은 {active.date} 일정에 저장</p>}<div hidden={folderPane!=='record'} className="record-pane"><section className="site-details"><div><span className="detail-label"><Clock size={14}/>방문 시간</span><strong>{active.time}</strong></div><div><span className="detail-label"><UserRound size={14}/>연락 대상</span><strong>{active.name}</strong><div className="phone-list">{active.phones.map(p=><a key={p} href={'tel:'+p}><Phone size={13}/>{p}</a>)}</div></div><div className="visit-note"><span className="detail-label"><TriangleAlert size={14}/>조사 메모</span><p>{active.notes}</p></div></section>
          <FolderRemarks key={active.id} folder={active} onDirty={setRemarksDirty} onSaved={()=>refresh(selected,true)}/></div><div hidden={folderPane!=='photos'} className="photos-pane"><div className="media-tabs" role="group" aria-label="사진 종류">{(['photo','drawing'] as const).map(kind=><button key={kind} className={mediaKind===kind?'primary-button':'secondary-button'} aria-pressed={mediaKind===kind} disabled={uploading||cameraPending||failed.length>0} onClick={()=>setMediaKind(kind)}>{kind==='drawing'?'도면':'현장 사진'} · {related.reduce((n,f)=>n+(kind==='photo'?(f.photoCount??f.count):(f.drawingCount??0)),0)}</button>)}</div><h2 className="sr-only">{mediaLabel} {visiblePhotos.length}장</h2>
          <div className={'upload-zone'+(dragging?' drag-active':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!uploading)void upload(Array.from(e.dataTransfer.files));}}>
            <span className="upload-icon"><CloudUpload size={28}/></span><div className="upload-copy"><h3>{uploading?'원본 저장 중':mediaKind==='drawing'?'도면 사진 추가':'현장 사진 추가'}</h3><p>{uploading?'저장이 끝날 때까지 이 화면을 열어두세요.':'여러 장 선택 · 한 장당 최대 20MB'}</p></div><div className="upload-actions"><BatchCamera owner={storageScope} folder={active.id} kind={mediaKind} key={active.id} disabled={uploading||folderDeleteBusy} progress={progress} onCancelUpload={()=>activeUpload.current?.abort()} onUpload={files=>upload(files,true)} onPendingChange={setCameraPending}/><button className="primary-button" disabled={uploading} onClick={()=>input.current?.click()}><CloudUpload size={17}/>{mediaKind==='drawing'?'도면 추가':'사진 추가'}</button></div>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif" multiple hidden onChange={e=>void upload(Array.from(e.target.files||[]))}/>
            {uploading&&<div className="upload-progress"><Progress value={progress.total?progress.done/progress.total*100:0}/><span>{progress.done} / {progress.total}장 처리</span><button className="secondary-button" onClick={()=>activeUpload.current?.abort()}>전송 중단</button></div>}
          </div>
          {failed.length>0&&<div className="error-banner"><TriangleAlert size={18}/><div><strong>{failed.length}장 저장 실패</strong><p>{failed.map(f=>f.name).join(', ')}</p></div><button disabled={uploading} onClick={()=>upload(failed)}>실패한 사진 다시 올리기</button><button disabled={uploading} onClick={()=>{setFailed([]);uploadPreviews.remove(item=>item.status==='failed');}}>재시도 취소</button></div>}
          {loading&&!pendingPhotos.length?<div className="loading-block" role="status">사진을 불러오는 중…</div>:visiblePhotos.length||pendingPhotos.length?<div className="photo-grid">
            {pendingPhotos.map(item=><article className="photo-card pending-photo" key={item.key} aria-label={item.file.name+' '+(item.status==='failed'?'저장 실패':item.status==='uploading'?'전송 중':'전송 대기')}>
              <div className="photo-image">{item.url&&!/hei[cf]/i.test(item.file.type)?<img src={item.url} alt={item.file.name} loading="lazy" decoding="async"/>:<div className="heic-placeholder"><ImageIcon size={34}/><span>원본 사진</span></div>}</div>
              <div className="photo-meta"><strong title={item.file.name}>{item.file.name}</strong><span>{formatBytes(item.file.size)} · 기기 원본 미리보기</span><span className={'photo-upload-status '+item.status}>{item.status==='failed'?'저장 실패':item.status==='uploading'?'전송 중 · 아직 저장되지 않음':'전송 대기 · 아직 저장되지 않음'}</span>{item.error&&<p className="photo-upload-error">{item.error}</p>}</div>
            </article>)}
            {visiblePhotos.map(photo=><article className="photo-card" key={photo.id}>
              <button className="photo-image" onClick={()=>setPreview(photo)} aria-label={photo.filename+' 크게 보기'}>{photo.content_type==='image/heic'?<div className="heic-placeholder"><ImageIcon size={34}/><span>HEIC 원본</span></div>:<img src={localPhotos.get(photo.id)?.url||'/api/photos/'+photo.id} alt={photo.filename} loading="lazy" decoding="async"/>}</button>
              <div className="photo-meta"><strong title={photo.filename}>{photo.filename}</strong><span>{folderDates.get(photo.folder)} 조사 · {dateText(photo.created_at)} · {formatBytes(photo.size)}</span>{localPhotos.has(photo.id)&&<span className="photo-upload-status saved"><Check size={14}/>저장 완료 · {((localPhotos.get(photo.id)?.elapsedMs||0)/1000).toFixed(1)}초</span>}{photo.kind==='drawing'&&<button className="secondary-button" disabled={uploading} onClick={()=>setDrawingPhoto(photo)}>자동 도면 만들기 · 비지오</button>}<div className="photo-actions"><a href={'/api/photos/'+photo.id+'?download=1'} download aria-label={photo.filename+' 다운로드'}><ArrowDownToLine size={17}/></a><button disabled={uploading} onClick={()=>setDeleting(photo)} aria-label={photo.filename+' 삭제'}><Trash2 size={16}/></button></div></div>
            </article>)}
          </div>:!error&&<div className="empty-photos"><ImageIcon size={36} strokeWidth={1.2}/><h3>아직 보관한 {mediaLabel}이 없어요</h3><p>추가한 {mediaLabel}은 이 건물에 원본으로 저장됩니다.</p></div>}
        {nextCursor&&<button className="secondary-button full-width" disabled={pageBusy||loading} onClick={()=>void loadMore()}>{pageBusy?'불러오는 중…':'사진 더 보기'}</button>}</div></>}
        {usage&&<details className="usage-disclosure"><summary><span>보관함 사용량</span><span>{(usage.storageBytes/1e9).toFixed(2)} / {usage.storageLimit/1e9} GB <ChevronDown size={16}/></span></summary><section aria-label="보관함 사용 한도">
          <div className="overview-strip">
            <div><span>사진·일정표 저장</span><strong>{(usage.storageBytes/1e9).toFixed(2)}<small>/ {usage.storageLimit/1e9} GB</small></strong></div>
            <div><span>최근 {usage.windowDays}일 업로드 요청</span><strong>{usage.writes.toLocaleString()}<small>/ {usage.writeLimit.toLocaleString()}회</small></strong></div>
            <div><span>최근 {usage.windowDays}일 사진 읽기</span><strong>{usage.reads.toLocaleString()}<small>/ {usage.readLimit.toLocaleString()}회</small></strong></div>
          </div>
          <StorageSettings usage={usage} onSaved={()=>refresh(selected,true)}/>
          {usage.storageBytes/usage.storageLimit>=0.8&&<p className="error-banner" role="status">저장 공간을 {Math.round(usage.storageBytes/usage.storageLimit*100)}% 사용했습니다. 전체 자료 백업과 이관을 준비해 주세요.</p>}
          {forecast?.daysRemaining!==null&&forecast?.daysRemaining!==undefined&&<p>최근 7일의 보관 중인 업로드량 기준 약 {Math.ceil(forecast.daysRemaining)}일 후 용량 도달 예상 · 삭제·촬영량 변화에 따라 달라집니다.</p>}
          <p className="export-help">한도에 도달하면 해당 업로드·사진 열기·다운로드가 중단됩니다. 기존 자료는 자동 삭제되지 않습니다. 사진 읽기에는 미리보기와 ZIP에 담긴 각 파일이 포함됩니다.</p>
          {(usage.storageBytes>=usage.storageLimit||usage.writes>=usage.writeLimit||usage.reads>=usage.readLimit)&&<p className="error-banner" role="status">사용 한도에 도달했습니다. 저장 공간은 불필요한 사진을 직접 삭제하면 확보할 수 있고, 요청 한도는 최근 32일 사용량이 줄어들면 다시 이용할 수 있습니다.</p>}
        </section></details>}
        <div className="management-tools"><BackupTools onDone={()=>refresh(selected,true)}/><PendingUploads owner={storageScope} folders={folders} disabled={uploading||remarksDirty||cameraPending||folderDeleteBusy} onBusy={setFolderDeleteBusy} onDone={()=>refresh(selected,true)}/></div><footer className="workspace-footer"><span><LockKeyhole size={13}/>로그인한 팀원이 함께 사용하는 보관함</span><span>{userName} {isAdmin&&<Link prefetch={false} href="/account/setup">계정 설정</Link>} <button className="subtle-button" disabled={uploading||remarksDirty||cameraPending} onClick={async()=>{try{const r=await fetch('/api/session',{method:'DELETE'});if(!r.ok)throw new Error();window.location.assign('/');}catch{toast.error('로그아웃하지 못했습니다. 다시 시도해 주세요.');}}}>로그아웃</button></span></footer>
      </main>
    </div>
    <Dialog open={actionPanel!==null} onOpenChange={open=>{if(!open)setActionPanel(null);}}><DialogContent className="workspace-action-dialog"><DialogHeader><DialogTitle>{actionPanel==='add'?'일정 추가':'폴더 작업'}</DialogTitle><DialogDescription>{actionPanel==='add'?'일정표 사진을 등록하거나 직접 입력하세요.':'현재 폴더의 일정과 보고서를 관리합니다.'}</DialogDescription></DialogHeader><div className="action-list"><button className={actionPanel==='more'?'secondary-button desktop-workspace-action':'secondary-button'} disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>{setActionPanel(null);setManualImport(false);setImporting(true);}}><CloudUpload size={19}/><span>일정표 사진 등록<small>사진에서 일정을 인식해 추가</small></span></button><button className="secondary-button" disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>{setActionPanel(null);setManualImport(true);setImporting(true);}}><Plus size={19}/><span>일정 직접 입력<small>추가 방문 일정도 바로 등록</small></span></button>{actionPanel==='more'&&<><button className="secondary-button mobile-workspace-action" disabled={loading||uploading||!!error} onClick={()=>{setActionPanel(null);setExportScope(active?.id??null);}}><ArrowDownToLine size={19}/><span>다운로드<small>현재 폴더의 현장 사진 내려받기</small></span></button>{region&&date&&<DailyReportButton region={region} date={date} disabled={loading||uploading||remarksDirty||!!error}/>}<button className="secondary-button" disabled={loading||uploading} onClick={()=>{setActionPanel(null);void refresh(selected);}}><RefreshCw size={18}/>새로고침</button>{region&&(!addressPath.length||active)&&<button className="secondary-button danger-action" disabled={loading||uploading||remarksDirty||folderDeleteBusy||cameraPending} onClick={()=>{setActionPanel(null);setFolderDelete(true);}}><Trash2 size={18}/>{active?'선택 일정 삭제':'폴더 삭제'}</button>}</>}</div></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="photo-dialog"><DialogHeader><DialogTitle>{preview?.filename}</DialogTitle><DialogDescription>원본 사진 · {preview&&formatBytes(preview.size)}</DialogDescription></DialogHeader>{preview&&(preview.content_type==='image/heic'?<p>이 브라우저에서는 HEIC 미리보기를 지원하지 않을 수 있어요. 원본을 내려받아 확인해 주세요.</p>:<img className="large-preview" src={localPhotos.get(preview.id)?.url||'/api/photos/'+preview.id} alt={preview.filename}/>)}{preview&&<a className="secondary-button" href={'/api/photos/'+preview.id+'?download=1'} download><ArrowDownToLine size={17}/>원본 다운로드</a>}</DialogContent></Dialog>
    <Dialog open={exportScope!==undefined} onOpenChange={open=>{if(!open)setExportScope(undefined);}}><DialogContent><DialogHeader><DialogTitle>폴더 그대로 다운로드</DialogTitle><DialogDescription>현재 선택한 폴더부터 시작하는 ZIP 파일로 받습니다. 완료 후에도 다시 다운로드할 수 있습니다.</DialogDescription></DialogHeader><div className="export-summary"><Archive size={30}/><div><strong>{(exportFolder?folderLabel(exportFolder):'')||[region,date].filter(Boolean).join(' / ')||'모든 지역과 날짜'}</strong><p>{exportItems.length}개 일정 폴더 · {exportItems.reduce((n,f)=>n+(f.photoCount??f.count),0)}장 · {formatBytes(exportItems.reduce((n,f)=>n+(f.photoBytes??f.bytes),0))}</p></div></div><div className="export-path"><FolderIcon size={17}/>{view==='address'?'일반건물·구분건물 / 주소 / 동·호수 / 사진 (날짜 폴더 없음)':'날짜 / 기존 일정 폴더 / 사진'}</div><p className="export-help">현재 보기의 폴더 구조로 현장 사진만 내려받습니다. 주소별 보기에서는 날짜 폴더 없이 같은 주소의 사진을 모읍니다. 파일명에 고유번호를 붙여 사진을 모두 보존합니다.</p><ArchiveDownload name={exportFolder?exportFolderLabel(exportFolder):date||region||'현장사진_전체'} query={exportQuery} onComplete={()=>void refresh(selected,true)}/></DialogContent></Dialog>
    {drawingPhoto&&<Suspense fallback={<div role="status">도면 편집기를 불러오는 중…</div>}><DrawingEditor key={drawingPhoto.id} photo={drawingPhoto} onClose={()=>setDrawingPhoto(null)}/></Suspense>}
    {editingSchedule&&<EditSchedule key={editingSchedule.id} folder={editingSchedule} onClose={()=>setEditingSchedule(null)} onSaved={async updated=>{
      setFolders(previous=>previous.map(f=>f.id===updated.id?{...f,...updated,count:f.count,bytes:f.bytes,photoCount:f.photoCount,photoBytes:f.photoBytes,drawingCount:f.drawingCount}:f));
      setEditingSchedule(null);navigationGuard.current.editingSchedule=false;
      location(updated.region,updated.date,updated.id,view==='address'?addressParts(updated,true).map(p=>p.key):[]);
      await refresh(updated.id,true);
    }}/>}
    {importing&&<ImportSchedule open manual={manualImport} initialRegion={region||''} initialDate={date||''} onClose={()=>setImporting(false)} onSaved={(r,d)=>{setImporting(false);location(r,d);void refresh(null);}}/>}
    <AlertDialog open={folderDelete} onOpenChange={open=>{if(!folderDeleteBusy)setFolderDelete(open);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 폴더를 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{active?active.date+' · '+folderLabel(active):[region,date].filter(Boolean).join(' / ')}<br/>{active?1:scoped.length}개 일정 폴더 · {active?active.count:scoped.reduce((n,f)=>n+f.count,0)}장의 사진이 영구 삭제됩니다. {!active&&'이 범위의 일정표 원본도 함께 삭제됩니다.'} 마지막 건물 폴더를 삭제하면 해당 날짜의 일정표 원본도 함께 삭제됩니다. 삭제한 자료는 복구할 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={folderDeleteBusy}>취소</AlertDialogCancel><AlertDialogAction disabled={folderDeleteBusy} onClick={e=>{e.preventDefault();void removeFolder();}}>{folderDeleteBusy?'삭제 중…':'폴더와 자료 삭제'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!deleteBusy)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 사진을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{deleting?.filename}<br/>보관함에서 원본이 영구 삭제되며 휴대폰과 PC 모두에서 사라집니다. 기기에 있는 사진은 삭제되지 않습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>취소</AlertDialogCancel><AlertDialogAction disabled={deleteBusy} onClick={e=>{e.preventDefault();void removePhoto();}}>{deleteBusy?'삭제 중…':'사진 삭제'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
