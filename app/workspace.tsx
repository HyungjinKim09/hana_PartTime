"use client";
import {announceAuthChange} from '@/lib/auth-change';
import {MyWork} from './my-work';
import {FolderParticipantManagement} from './folder-participant-management';
import {FolderDownloadStatus,DownloadSummary} from './folder-download-status';
import {SurveyParticipants} from './survey-participants';
import {AttributionLabel} from './attribution-label';
import {ActivityHistory} from './activity-history';
import {MemberManagement} from './member-management';
import {LibraryCards} from './library-cards';
import {LibraryCache,LibraryRequestError} from '@/lib/library-cache';
import type {LibraryPage,LibraryNavigation,LibraryCard} from '@/lib/library-types';
import Link from 'next/link';
import {PendingUploads} from './pending-uploads';
import {StorageSettings} from './storage-settings';
import {BackupTools} from './backup-tools';
import {savePending,deletePendingMany} from '@/lib/pending-uploads';
import {prepareUploadBatches} from '@/lib/upload-preparation';
import {uploadId} from '@/lib/upload-id';
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {Pencil,Plus,Archive,ArrowLeft,ArrowDownToLine,Check,ChevronRight,Clock,CloudUpload,Folder as FolderIcon,FolderOpen,Image as ImageIcon,LogOut,MapPin,Phone,RefreshCw,Settings,TriangleAlert,Trash2,UserRound,MoreHorizontal,ChevronDown,FileText} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Progress} from '@/components/ui/progress';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';
import {addressParts} from '@/lib/address-folders';
import {folderLabel,type Folder,type Photo} from '@/lib/types';
import {FolderRemarks,DailyReportButton} from './report-tools';
import {ImportSchedule} from './import-schedule';
import {EditSchedule} from './edit-schedule';
import {registerPhotoTools} from '@/lib/webmcp';
import type {BudgetUsage} from '@/lib/r2-budget';
import {exportFolderLabel} from '@/lib/daily-report';
import {FolderSearch} from './folder-search';
import {BulkFolderDelete} from './bulk-folder-delete';
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
  const [loggingOut,setLoggingOut]=useState(false);
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
  const [navigationReady,setNavigationReady]=useState(false);
  const [navigation,setNavigation]=useState<LibraryNavigation&{datesRegion:string|null}>({regions:[],dates:[],datesRegion:null});
  const cache=useRef(new LibraryCache());
  const [library,setLibrary]=useState<LibraryPage|null>(null),[folderPageBusy,setFolderPageBusy]=useState(false),[searchTerm,setSearchTerm]=useState('');
  const pathKey=JSON.stringify(addressPath);
  useEffect(()=>{const timer=setTimeout(()=>setSearchTerm(searchQuery.trim()),250);return()=>clearTimeout(timer);},[searchQuery]);
  const folderDates=new Map(folders.map(f=>[f.id,f.date]));
  const visiblePhotos=photos.filter(photo=>(photo.kind||'photo')===mediaKind);
  const mediaLabel=mediaKind==='drawing'?'도면 사진':'현장 사진';
  const active=folders.find(f=>f.id===selected);
  type UsageInfo={usage:BudgetUsage;forecast?:{dailyBytes:number;daysRemaining:number|null}};
  const [nextCursor,setNextCursor]=useState<string|null>(null),[pageBusy,setPageBusy]=useState(false),[forecast,setForecast]=useState<UsageInfo['forecast']>();
  const lastRefresh=useRef(0),auxiliarySequence=useRef(0);
  const handleFailure=useCallback((e:unknown)=>{if(e instanceof LibraryRequestError&&e.status===401){sequence.current++;auxiliarySequence.current++;cache.current.clear();setLibrary(null);setPhotos([]);setFolders([]);setUsage(null);setNavigation({regions:[],dates:[],datesRegion:null});setLoading(false);}if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'보관함 조회 실패');},[]);
  useEffect(()=>{const store=cache.current;return()=>{store.clear();activeUpload.current?.abort();};},[]);
  const scopeUrl=useCallback((folder:string|null)=>{const params=new URLSearchParams({view,limit:'60'});if(folder){params.set('folder',folder);params.set('kind',mediaKind);if(view==='address'&&region){params.set('region',region);if(pathKey!=='[]')params.set('path',pathKey);}}else{if(region)params.set('region',region);if(date&&view==='date')params.set('date',date);if(view==='address'&&pathKey!=='[]')params.set('path',pathKey);if(searchTerm)params.set('q',searchTerm);}return '/api/library?'+params;},[view,mediaKind,region,date,pathKey,searchTerm]);
  const applyPage=useCallback((data:LibraryPage)=>{setLibrary(data);setFolders(data.folders);setPhotos(data.photos);setNextCursor(data.nextCursor);setError('');if(data.canonicalAddressPath){setAddressPath(data.canonicalAddressPath);const q=new URLSearchParams(window.location.hash.slice(1));q.set('path',JSON.stringify(data.canonicalAddressPath));window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search+'#'+q);}},[]);
  const auxiliary=useCallback(async()=>{const seq=++auxiliarySequence.current,nav='/api/library?'+new URLSearchParams({navigation:'1',...(region?{region}:{})});try{const [info,tree]=await Promise.all([cache.current.get<UsageInfo>('/api/library?usageOnly=1'),cache.current.get<LibraryNavigation>(nav)]);if(seq===auxiliarySequence.current){setUsage(info.usage);setForecast(info.forecast);setNavigation({...tree,datesRegion:region});}}catch(e){if(seq===auxiliarySequence.current||e instanceof LibraryRequestError&&e.status===401)handleFailure(e);}},[region,handleFailure]);
  const refresh=useCallback(async(folder:string|null,quiet=false,reuse=false)=>{
    const seq=++sequence.current,url=scopeUrl(folder);
    if(!reuse)cache.current.invalidate(key=>{const params=new URL(key).searchParams;if(params.has('usageOnly')||params.has('navigation'))return true;if(params.has('folder'))return params.get('folder')===folder||!!cache.current.peek<LibraryPage>(key)?.folders.some(f=>f.id===folder);return !params.has('region')||params.get('region')===region&&(params.get('view')==='address'||!params.has('date')||params.get('date')===date);});
    const cached=cache.current.peek<LibraryPage>(url);
    if(cached){if(reuse||!quiet)applyPage(cached);setLoading(false);if(cache.current.fresh(url))return;}
    else{setLibrary(null);setFolders([]);setPhotos([]);setNextCursor(null);}
    if(!quiet&&!cached)setLoading(true);
    try{
      const data=await cache.current.get<LibraryPage>(url);
      if(seq===sequence.current){lastRefresh.current=Date.now();applyPage(data);}
      if(!reuse)await auxiliary();
    }
    catch(e){if(seq===sequence.current||e instanceof LibraryRequestError&&e.status===401)handleFailure(e);}
    finally{if(seq===sequence.current)setLoading(false);}
  },[scopeUrl,applyPage,auxiliary,region,date,handleFailure]);
  const liveRefresh=useRef<{url:string;reload:()=>Promise<void>}|null>(null);liveRefresh.current={url:scopeUrl(selected),reload:()=>refresh(selected,true)};
  // Choose the starting pane only when navigating, preserving it when photo kind changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{setFolderPane(window.matchMedia('(min-width: 1024px)').matches?'record':'photos');},[selected,view]);
  // Hash navigation and cached network state are synchronized at this external boundary.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(navigationReady){setFailed([]);void refresh(selected,false,true);}},[selected,refresh,navigationReady]);
  useEffect(()=>{if(navigationReady)void auxiliary().catch(e=>setError(e instanceof Error?e.message:'보관함 조회 실패'));},[auxiliary,navigationReady]);
  useEffect(()=>{const update=()=>{if(!uploading&&!remarksDirty&&!cameraPending&&document.visibilityState==='visible'&&Date.now()-lastRefresh.current>=300000){void refresh(selected,true,true);void auxiliary().catch(()=>{});}};window.addEventListener('focus',update);return()=>window.removeEventListener('focus',update);},[selected,refresh,auxiliary,uploading,remarksDirty,cameraPending]);
  useEffect(()=>{if(!uploading&&!remarksDirty&&!cameraPending&&!folderDeleteBusy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uploading,remarksDirty,cameraPending,folderDeleteBusy]);

  async function loadMore(){if(!selected||!nextCursor||pageBusy)return;const seq=sequence.current,url=scopeUrl(selected);setPageBusy(true);try{const data=await cache.current.get<Pick<LibraryPage,'photos'|'nextCursor'>>('/api/library?'+new URLSearchParams({folder:selected,view,kind:mediaKind,photosOnly:'1',limit:'60',cursor:nextCursor}));if(seq===sequence.current){const old=cache.current.peek<LibraryPage>(url);if(old){const updated={...old,photos:[...old.photos,...data.photos.filter(p=>!old.photos.some(item=>item.id===p.id))],nextCursor:data.nextCursor};cache.current.set(url,updated);applyPage(updated);}}}catch(e){if(e instanceof LibraryRequestError&&e.status===401)handleFailure(e);else toast.error(e instanceof Error?e.message:'사진 조회 실패');}finally{setPageBusy(false);}}
  async function loadMoreFolders(){if(!library?.nextFoldersCursor||folderPageBusy)return;const seq=sequence.current,url=scopeUrl(null);setFolderPageBusy(true);try{const data=await cache.current.get<LibraryPage>(url+'&foldersCursor='+library.nextFoldersCursor);if(seq===sequence.current){const old=cache.current.peek<LibraryPage>(url);if(old){const updated={...old,cards:[...old.cards,...data.cards.filter(card=>!old.cards.some(item=>item.key===card.key))],nextFoldersCursor:data.nextFoldersCursor};cache.current.set(url,updated);applyPage(updated);}}}catch(e){if(e instanceof LibraryRequestError&&e.status===401)handleFailure(e);else toast.error(e instanceof Error?e.message:'폴더 조회 실패');}finally{setFolderPageBusy(false);}}

  async function refreshOperationMetadata(ids:string[],changedScope:{region?:string;date?:string}){
    const affected=(key:string)=>{const p=new URL(key,'https://library.invalid').searchParams;if(p.has('usageOnly')||p.has('navigation')||p.has('photosOnly'))return false;if(p.has('folder'))return ids.includes(p.get('folder')!)||!!cache.current.peek<LibraryPage>(key)?.folders?.some(f=>ids.includes(f.id));return !p.has('region')||!changedScope.region||p.get('region')===changedScope.region&&(p.get('view')==='address'||!p.has('date')||!changedScope.date||p.get('date')===changedScope.date);};
    cache.current.invalidate(affected);const current=liveRefresh.current;if(current&&affected(current.url))await current.reload();
  }
  async function upload(files:File[],fromCamera=false):Promise<File[]>{
    if(!selected||uploadLock.current||folderDeleteBusy||!files.length)return files;
    uploadLock.current=true;const uploadTask=new AbortController();activeUpload.current=uploadTask;
    const target=selected,kind=mediaKind;setUploading(true);setFailed([]);setProgress({done:0,total:files.length});
    sequence.current++;setLoading(false);
    const confirmed:string[]=[];let preparation:ReturnType<typeof prepareUploadBatches>|undefined;
    try{
      const entries=uploadPreviews.begin(files,target,kind);
      const prepared=prepareUploadBatches(files,batch=>savePending(storageScope,target,kind,batch));preparation=prepared;let warned=false;
      const result=await uploadPhotos(files,target,kind,{
        signal:uploadTask.signal,
        beforeUpload:async(_file,index)=>{const error=await prepared.ready[index];if(error&&!warned){warned=true;toast.warning('이 기기에 임시 보관하지 못했습니다. 서버 저장이 끝날 때까지 화면을 열어 두세요. 실패한 사진은 원본을 내려받아 보관할 수 있습니다.');}},
        onStart:(_file,index)=>uploadPreviews.patch(entries[index].key,{status:'uploading'}),
        onSaved:(file,photo,index,elapsedMs)=>{
          confirmed.push(uploadId(file));
          uploadPreviews.patch(entries[index].key,{status:'saved',photo,elapsedMs});
          setPhotos(previous=>[photo,...previous.filter(item=>item.id!==photo.id)]);
          setFolders(previous=>previous.map(folder=>folder.id===target?{...folder,count:folder.count+1,bytes:folder.bytes+photo.size,photoCount:(folder.photoCount??0)+(kind==='photo'?1:0),photoBytes:(folder.photoBytes??0)+(kind==='photo'?photo.size:0),drawingCount:(folder.drawingCount??0)+(kind==='drawing'?1:0)}:folder));
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
      await preparation?.done;
      await deletePendingMany(storageScope,confirmed).catch(()=>toast.warning('서버 저장은 완료됐지만 기기 임시 보관을 정리하지 못했습니다. 미전송 목록에서 재확인해 주세요.'));
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
  const pathLabels=library?.pathLabels||[];
  const related=[...folders].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const regions=navigation.regions;
  const cards=library?.cards||[];
  const summary=library?.summary||{schedules:0,withPhotos:0,withFieldPhotos:0,photos:0,bytes:0,fieldPhotos:0,fieldBytes:0,completed:0};
  const deleteGroups=active?[{key:active.id,label:folderLabel(active),folders:related}]:cards.map(card=>({key:card.key,label:(searchQuery.trim()?card.target.region+' · ':'')+card.label,folders:[],selection:card.target,summary:card.summary}));
  const exportQuery=new URLSearchParams(exportFolder?{folder:exportFolder.id}:region?date?{region,date}:{region}:{});
  exportQuery.set('view',view);if(view==='address'&&addressPath.length)exportQuery.set('path',JSON.stringify(addressPath));
  function openCard(card:LibraryCard){const scope=card.target;location(scope.region||null,scope.date||null,scope.folder||null,scope.path||[],scope.view);}
  const navigationGuard=useRef({uploading:false,remarksDirty:false,folderDeleteBusy:false,cameraPending:false,editingSchedule:false,scheduleUrl:''});
  navigationGuard.current={uploading,remarksDirty,folderDeleteBusy,cameraPending,editingSchedule:!!editingSchedule,scheduleUrl:scheduleLocation.current};
  const historyPosition=useRef<{index:number;parents:number[]}>({index:0,parents:[]});
  function locationUrl(r:string|null,d:string|null,id:string|null,path:string[]=[],mode=view){const q=new URLSearchParams({view:mode});if(r)q.set('region',r);if(d&&mode==='date')q.set('date',d);if(id)q.set('folder',id);if(path.length)q.set('path',JSON.stringify(path));return window.location.pathname+window.location.search+'#'+q.toString();}
  useEffect(()=>{
    const restore=()=>{setMediaKind('photo');setSearchQuery('');setSearchTerm('');historyPosition.current=window.history.state?.hanaNavigation||{index:0,parents:[]};const q=new URLSearchParams(window.location.hash.slice(1));const mode=q.get('view')==='address'?'address':'date';setView(mode);setRegion(q.get('region'));setDate(mode==='date'?q.get('date'):null);setSelected(q.get('folder'));let path:string[]=[];try{const v=JSON.parse(q.get('path')||'[]');if(Array.isArray(v)&&v.length<=4&&v.every(x=>typeof x==='string'))path=v;}catch{}setAddressPath(mode==='address'?path:[]);setPreview(null);setExportScope(undefined);setImporting(false);setEditingSchedule(null);setFolderDelete(false);setRemarksDirty(false);setNavigationReady(true);};
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
    const url=locationUrl(r,d,id,path,mode);
    const sameLocation=url===window.location.pathname+window.location.search+window.location.hash;
    if(sameLocation&&!searchQuery&&!searchTerm)return;
    if(!sameLocation){
      const position={index:historyPosition.current.index+1,parents:[]};
      window.history.pushState({...window.history.state,hanaNavigation:position},'',url);
      historyPosition.current=position;
    }
    setMediaKind('photo');setSearchQuery('');setSearchTerm('');setView(mode);setAddressPath(path);setRegion(r);setDate(d);setSelected(id);setPreview(null);setExportScope(undefined);window.scrollTo({top:0,behavior:'smooth'});
  }
  function parentLocation(){if(addressPath.length)location(region,date,null,addressPath.slice(0,-1));else if(selected)location(region,date);else if(date)location(region);else location(null);}
  async function removeFolder(){
    if(!region||folderDeleteBusy)return;setFolderDeleteBusy(true);
    const query=new URLSearchParams(active?{id:active.id}:date?{region,date}:{region});
    try{let continuation:unknown=undefined;for(;;){const response=await fetch('/api/folders?'+query,{method:'DELETE',headers:continuation?{'Content-Type':'application/json'}:undefined,body:continuation?JSON.stringify(continuation):undefined});const result=await response.json() as {error?:string;deleted:boolean;continuation?:unknown};if(!response.ok)throw new Error(result.error||'폴더를 삭제하지 못했습니다. 같은 삭제 버튼으로 다시 시도해 주세요.');if(result.deleted)break;continuation=result.continuation;if(!continuation)throw new Error('삭제 진행을 확인하지 못했습니다. 다시 시도해 주세요.');}
      const next=active?{r:region,d:date}:date?{r:region,d:null}:{r:null,d:null};
      setFolderDeleteBusy(false);navigationGuard.current.folderDeleteBusy=false;setSelected(null);setRegion(next.r);setDate(next.d);setAddressPath([]);window.history.replaceState(window.history.state,'',locationUrl(next.r,next.d,null));setFolderDelete(false);setRemarksDirty(false);cache.current.invalidate();toast.success('폴더와 포함된 자료를 삭제했습니다.');
    }catch(e){toast.error(e instanceof Error?e.message:'삭제하지 못했습니다. 다시 시도해 주세요.');await refresh(selected,true);}finally{setFolderDeleteBusy(false);}
  }

  const accountActionsBlocked=uploading||remarksDirty||cameraPending||folderDeleteBusy||loggingOut;
  async function logout(){
    if(accountActionsBlocked)return;
    setLoggingOut(true);
    try{
      const response=await fetch('/api/session',{method:'DELETE'});
      if(!response.ok)throw new Error();
      announceAuthChange();
      cache.current.clear();
      window.location.assign('/');
    }catch{
      setLoggingOut(false);
      toast.error('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    }
  }

  return <div className="app-shell">
    <Toaster richColors position="top-center" theme="light"/>
    <header className="app-header">
      <Link prefetch={false} href={view==='address'?'/#view=address':'/'} className="brand" aria-label="HANA 홈" onNavigate={event=>{
        event.preventDefault();
        location(null);
      }}>
        <span className="brand-mark"><FolderOpen size={21}/></span><span>HANA</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger type="button" className="account-menu-trigger" aria-label={`${userName} 계정 메뉴`}>
          <UserRound size={16} aria-hidden="true"/><span title={userName}>{userName}</span><ChevronDown size={14} aria-hidden="true"/>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="account-menu">
          {isAdmin&&<DropdownMenuItem asChild disabled={accountActionsBlocked}>
            <a href="/account/setup" onClick={event=>{if(accountActionsBlocked)event.preventDefault();}}>
              <Settings aria-hidden="true"/>관리자 계정 설정
            </a>
          </DropdownMenuItem>}
          <DropdownMenuItem disabled={accountActionsBlocked} onSelect={()=>void logout()}>
            <LogOut aria-hidden="true"/>{loggingOut?'로그아웃 중…':'로그아웃'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <div className="workspace-layout">
      <aside className="project-panel">
        <nav aria-label="조사 구역">
          <h2 className="panel-label">조사 구역</h2>
          <button className="date-nav" aria-current={!region?'page':undefined} disabled={uploading} onClick={()=>location(null)}>
            <FolderOpen size={17}/><span>전체 지역</span><span className="nav-count">{regions.length}</span>
          </button>
          <ul className="folder-index">{regions.map(r=>{
            const datesOpen=view==='date'&&region===r&&navigation.datesRegion===r&&navigation.dates.length>0;
            return <li key={r}>
              <button className={region===r?'index-item active':'index-item'} aria-current={region===r&&!date?'page':undefined} aria-expanded={view==='date'?datesOpen:undefined} disabled={uploading} onClick={()=>location(r)}>
                <FolderIcon size={16}/><span>{r}</span>
              </button>
              {datesOpen&&<div className="date-tree-reveal"><div className="date-tree-clip">
                <ul className="date-tree">{navigation.dates.map(item=><li key={item.date}>
                  <button className={date===item.date?'index-item active date-index':'index-item date-index'} aria-current={date===item.date?'page':undefined} disabled={uploading} onClick={()=>location(r,item.date)}>
                    <span>{item.date}</span><span>{item.schedules}</span>
                  </button>
                </li>)}</ul>
              </div></div>}
            </li>;
          })}</ul>
        </nav>
        <button className="secondary-button sidebar-import" disabled={uploading||remarksDirty||cameraPending} onClick={()=>{setManualImport(false);setImporting(true);}}>
          <CloudUpload size={17}/>일정표 사진 등록
        </button>
      </aside>
      <main className="main-workspace">
        {region&&<div className="workspace-location"><button className="back-button" disabled={uploading||folderDeleteBusy} onClick={parentLocation}><ArrowLeft size={16}/>상위 폴더로</button>
        <nav aria-label="현재 위치" className="breadcrumb"><button disabled={uploading} onClick={()=>location(null)}>전체 지역</button>{region&&<><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region)}>{region}</button></>}{date&&<><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region,date)}>{date}</button></>}{pathLabels.map((label,i)=><span key={i} style={{display:'contents'}}><ChevronRight size={14}/><button disabled={uploading} onClick={()=>location(region,date,i===addressPath.length-1?selected:null,addressPath.slice(0,i+1))}>{label}</button></span>)}{active&&!addressPath.length&&<><ChevronRight size={14}/><span>{folderLabel(active)}</span></>}</nav></div>}
        <section className="page-heading"><div className="page-title"><h1>{active?pathLabels.at(-1)||folderLabel(active):pathLabels.at(-1)||(date?`${date} 현장조사`:region||'현장조사 보관함')}</h1>{active&&<p className="folder-context">{[active.date,active.address].filter(Boolean).join(' · ')}</p>}</div><div className="heading-actions">{active&&<button className="secondary-button" disabled={loading||uploading||remarksDirty||cameraPending||folderDeleteBusy} onClick={()=>{scheduleLocation.current=window.location.pathname+window.location.search+window.location.hash;setEditingSchedule(active);}}><Pencil size={17}/>일정 수정</button>}{!active&&<button className="primary-button" disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>setActionPanel('add')}><Plus size={18}/>일정 추가</button>}<button className="secondary-button download-priority desktop-workspace-action" onClick={()=>setExportScope(active?.id??null)} disabled={loading||uploading||!!error}><ArrowDownToLine size={17}/>다운로드</button><button className="secondary-button mobile-workspace-action schedule-photo-action" disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>{setManualImport(false);setImporting(true);}}><CloudUpload size={17}/>일정표 사진등록</button><button className="secondary-button icon-button" aria-label="폴더 더보기" disabled={uploading||cameraPending} onClick={()=>setActionPanel('more')}><MoreHorizontal size={20}/></button></div></section>
        {!active&&!selected&&<div className="browse-toolbar">
          <label className="mobile-region-select"><span>조사 구역</span><select value={region??''} disabled={uploading||remarksDirty||cameraPending||folderDeleteBusy} onChange={e=>location(e.target.value||null,null,null,[],view)}>
            <option value="">전체 지역</option>
            {regions.map(item=><option key={item} value={item}>{item}</option>)}
          </select></label>
          <div className="view-switch" role="group" aria-label="폴더 보기 방식">
            {(['date','address'] as const).map(mode=><button key={mode} aria-pressed={view===mode} disabled={uploading||remarksDirty||cameraPending} onClick={()=>location(region,null,null,[],mode)}>{mode==='date'?'날짜별 보기':'주소별 보기'}</button>)}
          </div>
          <FolderSearch query={searchQuery} onQuery={setSearchQuery}/>
        </div>}
        <div className="workspace-utilities"><MyWork key={view==='date'&&region&&date?JSON.stringify([region,date]):'today'} reportScope={view==='date'&&region&&date?{region,date}:undefined} disabled={uploading||remarksDirty||cameraPending||folderDeleteBusy} onFolder={(r,d,id)=>location(r,d,id,[],'date')}/>{!selected&&<div className="bulk-delete-toolbar"><BulkFolderDelete groups={deleteGroups} disabled={loading||uploading||remarksDirty||cameraPending||folderDeleteBusy||!!error} onBusy={setFolderDeleteBusy} onDone={async ids=>{if(ids)cache.current.invalidate(key=>{const id=new URL(key).searchParams.get('folder');return !!id&&(ids.includes(id)||!!cache.current.peek<LibraryPage>(key)?.folders.some(f=>ids.includes(f.id)));});await refresh(selected,true);}}/></div>}</div>
        <div className="workspace-context"><SurveyParticipants people={library?.summary.participants} date={active?.date||date||undefined}/>{!active&&library&&<DownloadSummary summary={library.summary}/>}</div>
        {active&&<div className="folder-operations-controls"><FolderDownloadStatus folder={active}/>{isAdmin&&<FolderParticipantManagement key={active.id+'-participants'} folder={active.id} disabled={loading||uploading||remarksDirty||cameraPending||folderDeleteBusy} onSaved={()=>refreshOperationMetadata([active.id],{region:active.region,date:active.date})}/>}</div>}
        {active&&<section className="mobile-visit-summary" aria-label="현장 핵심 정보"><div><span><Clock size={14}/>{active.time||'시간 미정'}</span><strong>{active.name||'연락 대상 미입력'}</strong><span className="visit-status">{active.surveyStatus||'미완료'}</span></div>{active.phones.length>0&&<div className="phone-list">{active.phones.map(p=><a key={p} href={'tel:'+p}><Phone size={14}/>{p}</a>)}</div>}{active.notes&&<div className="visit-notice"><strong>방문 전 확인사항</strong><p>{active.notes}</p></div>}</section>}
        {active&&<div className="folder-pane-nav" role="group" aria-label="폴더 작업 선택">{([{id:'photos',label:'사진',icon:ImageIcon},{id:'record',label:'조사 정보',icon:FileText},{id:'map',label:'길찾기',icon:MapPin}] as const).map(pane=><button key={pane.id} aria-pressed={folderPane===pane.id} disabled={uploading||cameraPending} onClick={()=>setFolderPane(pane.id)}><pane.icon size={18}/>{pane.label}</button>)}</div>}
        {active&&folderPane==='map'&&<MapDirections folder={active}/>}
        {!active&&view==='address'&&addressPath.length>=2&&library?.place&&<details className="building-directions" key={addressPath.join('/')}><summary><MapPin size={17}/>이 건물 길찾기<ChevronDown size={16}/></summary><MapDirections folder={library!.place!}/></details>}
        {error&&<div className="error-banner" role="alert"><TriangleAlert size={19}/><span>{error}</span><button onClick={()=>refresh(selected)}>다시 시도</button></div>}
        {usage&&(usage.storageBytes>=usage.storageLimit||usage.writes>=usage.writeLimit||usage.reads>=usage.readLimit)&&<div className="error-banner" role="status">보관함 사용 한도에 도달했습니다. 화면 아래 ‘보관함 사용량’에서 자세한 내용을 확인하세요.</div>}
        {!active&&!selected&&<><div className="overview-strip"><div><span>조사 일정</span><strong>{summary.schedules}<small>곳</small></strong></div><div><span>사진 있는 폴더</span><strong>{summary.withPhotos}<small>/ {summary.schedules}</small></strong></div><div><span>보관한 사진</span><strong>{summary.photos}<small>장</small></strong></div><div className="storage-stat"><CloudUpload size={20}/><span>원본 저장<small>{formatBytes(summary.bytes)}</small></span></div></div>
          <div className="section-heading"><h2><FolderOpen size={20}/>{searchQuery.trim()?'검색 결과':region&&(view==='address'||date)?'주소 폴더':region?'조사 날짜 폴더':'지역 폴더'} <span>{library?.totalCards||0}</span></h2><button className="subtle-button" onClick={()=>refresh(null)} disabled={loading}><RefreshCw size={15} className={loading?'spin':''}/>새로고침</button></div>
          {loading&&!library?<div className="loading-block" role="status">폴더 목록을 불러오고 있어요.</div>:<><LibraryCards cards={cards} onOpen={openCard} search={!!searchQuery.trim()}/>{!cards.length&&<p className="library-empty" role="status">{searchQuery.trim()?'검색 결과가 없습니다.':'등록된 일정이 없습니다.'}</p>}{library?.nextFoldersCursor&&<button className="secondary-button full-width" disabled={folderPageBusy} onClick={()=>void loadMoreFolders()}>{folderPageBusy?'불러오는 중…':'폴더 더 보기'}</button>}</>}
        </>}
        {active&&<>{related.length>1&&<label className="section-heading">업로드·조사 메모를 저장할 일정 <select aria-label="업로드·조사 메모를 저장할 일정" value={active.id} disabled={uploading||remarksDirty||cameraPending} onChange={e=>location(region,date,e.target.value,addressPath)}>{related.map(f=><option key={f.id} value={f.id}>{f.date} · {f.time} · {f.name||f.lot}</option>)}</select></label>}{view==='address'&&<p className="scope-note">모든 날짜의 사진 · 새 기록은 {active.date} 일정에 저장</p>}<div hidden={folderPane!=='record'} className="record-pane"><section className="site-details"><div><span className="detail-label"><Clock size={14}/>방문 시간</span><strong>{active.time}</strong></div><div><span className="detail-label"><UserRound size={14}/>연락 대상</span><strong>{active.name}</strong><div className="phone-list">{active.phones.map(p=><a key={p} href={'tel:'+p}><Phone size={13}/>{p}</a>)}</div></div><div className="visit-note"><span className="detail-label"><TriangleAlert size={14}/>조사 메모</span><p>{active.notes}</p></div></section>
          <AttributionLabel value={active.createdBy} label="일정 등록"/>{active.scheduleUpdatedBy&&<AttributionLabel value={active.scheduleUpdatedBy} label="최근 일정 수정"/>}{active.surveyUpdatedBy&&<AttributionLabel value={active.surveyUpdatedBy} label="최근 조사 수정"/>}<FolderRemarks key={active.id} folder={active} onDirty={setRemarksDirty} onSaved={()=>refresh(selected,true)}/></div><div hidden={folderPane!=='photos'} className="photos-pane"><div className="media-tabs" role="group" aria-label="사진 종류">{(['photo','drawing'] as const).map(kind=><button key={kind} className={mediaKind===kind?'primary-button':'secondary-button'} aria-pressed={mediaKind===kind} disabled={uploading||cameraPending||failed.length>0} onClick={()=>setMediaKind(kind)}>{kind==='drawing'?'도면':'현장 사진'} · {related.reduce((n,f)=>n+(kind==='photo'?(f.photoCount??f.count):(f.drawingCount??0)),0)}</button>)}</div><h2 className="sr-only">{mediaLabel} {visiblePhotos.length}장</h2>
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
              <div className="photo-meta"><strong title={photo.filename}>{photo.filename}</strong><span>{folderDates.get(photo.folder)} 조사 · {dateText(photo.created_at)} · {formatBytes(photo.size)}</span>{localPhotos.has(photo.id)&&<span className="photo-upload-status saved"><Check size={14}/>저장 완료 · {((localPhotos.get(photo.id)?.elapsedMs||0)/1000).toFixed(1)}초</span>}<AttributionLabel value={photo.createdBy} label="업로드"/>{photo.kind==='drawing'&&<button className="secondary-button" disabled={uploading} onClick={()=>setDrawingPhoto(photo)}>자동 도면 만들기 · 비지오</button>}<div className="photo-actions"><a href={'/api/photos/'+photo.id+'?download=1'} download aria-label={photo.filename+' 다운로드'}><ArrowDownToLine size={17}/></a><button disabled={uploading} onClick={()=>setDeleting(photo)} aria-label={photo.filename+' 삭제'}><Trash2 size={16}/></button></div></div>
            </article>)}
          </div>:!error&&<div className="empty-photos"><ImageIcon size={36} strokeWidth={1.2}/><h3>아직 보관한 {mediaLabel}이 없어요</h3><p>추가한 {mediaLabel}은 이 건물에 원본으로 저장됩니다.</p></div>}
        {nextCursor&&<button className="secondary-button full-width" disabled={pageBusy||loading} onClick={()=>void loadMore()}>{pageBusy?'불러오는 중…':'사진 더 보기'}</button>}</div></>}
        {usage&&<details className="usage-disclosure"><summary><span>보관함 사용량</span><span>{(usage.storageBytes/1e9).toFixed(2)} / {usage.storageLimit/1e9} GB <ChevronDown size={16}/></span></summary><section aria-label="보관함 사용 한도">
          <div className="overview-strip">
            <div><span>사진·일정표 저장</span><strong>{(usage.storageBytes/1e9).toFixed(2)}<small>/ {usage.storageLimit/1e9} GB</small></strong></div>
            <div><span>최근 {usage.windowDays}일 업로드 요청</span><strong>{usage.writes.toLocaleString()}<small>/ {usage.writeLimit.toLocaleString()}회</small></strong></div>
            <div><span>최근 {usage.windowDays}일 사진 읽기</span><strong>{usage.reads.toLocaleString()}<small>/ {usage.readLimit.toLocaleString()}회</small></strong></div>
          </div>
          {isAdmin&&<StorageSettings usage={usage} onSaved={()=>refresh(selected,true)}/>}
          {usage.storageBytes/usage.storageLimit>=0.8&&<p className="error-banner" role="status">저장 공간을 {Math.round(usage.storageBytes/usage.storageLimit*100)}% 사용했습니다. 전체 자료 백업과 이관을 준비해 주세요.</p>}
          {forecast?.daysRemaining!==null&&forecast?.daysRemaining!==undefined&&<p>최근 7일의 보관 중인 업로드량 기준 약 {Math.ceil(forecast.daysRemaining)}일 후 용량 도달 예상 · 삭제·촬영량 변화에 따라 달라집니다.</p>}
          <p className="export-help">한도에 도달하면 해당 업로드·사진 열기·다운로드가 중단됩니다. 기존 자료는 자동 삭제되지 않습니다. 사진 읽기에는 미리보기와 ZIP에 담긴 각 파일이 포함됩니다.</p>
          {(usage.storageBytes>=usage.storageLimit||usage.writes>=usage.writeLimit||usage.reads>=usage.readLimit)&&<p className="error-banner" role="status">사용 한도에 도달했습니다. 저장 공간은 불필요한 사진을 직접 삭제하면 확보할 수 있고, 요청 한도는 최근 32일 사용량이 줄어들면 다시 이용할 수 있습니다.</p>}
        </section></details>}
        <div className="management-tools"><ActivityHistory key={selected||'all'} folder={selected||undefined} disabled={uploading||cameraPending||folderDeleteBusy}/>{isAdmin&&<MemberManagement disabled={uploading||cameraPending||folderDeleteBusy}/>}<BackupTools onDone={()=>{cache.current.invalidate();return refresh(selected,true);}}/><PendingUploads owner={storageScope} folders={folders} disabled={uploading||remarksDirty||cameraPending||folderDeleteBusy} onBusy={setFolderDeleteBusy} onDone={ids=>{cache.current.invalidate(key=>{const id=new URL(key).searchParams.get('folder');return !id||ids.includes(id)||!!cache.current.peek<LibraryPage>(key)?.folders.some(f=>ids.includes(f.id));});return refresh(selected,true);}}/></div>
      </main>
    </div>
    <Dialog open={actionPanel!==null} onOpenChange={open=>{if(!open)setActionPanel(null);}}><DialogContent className="workspace-action-dialog"><DialogHeader><DialogTitle>{actionPanel==='add'?'일정 추가':'폴더 작업'}</DialogTitle><DialogDescription>{actionPanel==='add'?'일정표 사진을 등록하거나 직접 입력하세요.':'현재 폴더의 일정과 보고서를 관리합니다.'}</DialogDescription></DialogHeader><div className="action-list"><button className={actionPanel==='more'?'secondary-button desktop-workspace-action':'secondary-button'} disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>{setActionPanel(null);setManualImport(false);setImporting(true);}}><CloudUpload size={19}/><span>일정표 사진 등록<small>사진에서 일정을 인식해 추가</small></span></button><button className="secondary-button" disabled={loading||uploading||remarksDirty||cameraPending} onClick={()=>{setActionPanel(null);setManualImport(true);setImporting(true);}}><Plus size={19}/><span>일정 직접 입력<small>추가 방문 일정도 바로 등록</small></span></button>{actionPanel==='more'&&<><button className="secondary-button mobile-workspace-action" disabled={loading||uploading||!!error} onClick={()=>{setActionPanel(null);setExportScope(active?.id??null);}}><ArrowDownToLine size={19}/><span>다운로드<small>현재 폴더의 현장 사진 내려받기</small></span></button>{region&&date&&<DailyReportButton region={region} date={date} disabled={loading||uploading||remarksDirty||!!error}/>}<button className="secondary-button" disabled={loading||uploading} onClick={()=>{setActionPanel(null);void refresh(selected);}}><RefreshCw size={18}/>새로고침</button>{region&&(!addressPath.length||active)&&<button className="secondary-button danger-action" disabled={loading||uploading||remarksDirty||folderDeleteBusy||cameraPending} onClick={()=>{setActionPanel(null);setFolderDelete(true);}}><Trash2 size={18}/>{active?'선택 일정 삭제':'폴더 삭제'}</button>}</>}</div></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="photo-dialog"><DialogHeader><DialogTitle>{preview?.filename}</DialogTitle><DialogDescription>원본 사진 · {preview&&formatBytes(preview.size)}</DialogDescription></DialogHeader>{preview&&(preview.content_type==='image/heic'?<p>이 브라우저에서는 HEIC 미리보기를 지원하지 않을 수 있어요. 원본을 내려받아 확인해 주세요.</p>:<img className="large-preview" src={localPhotos.get(preview.id)?.url||'/api/photos/'+preview.id} alt={preview.filename}/>)}{preview&&<a className="secondary-button" href={'/api/photos/'+preview.id+'?download=1'} download><ArrowDownToLine size={17}/>원본 다운로드</a>}</DialogContent></Dialog>
    <Dialog open={exportScope!==undefined} onOpenChange={open=>{if(!open)setExportScope(undefined);}}><DialogContent className="archive-dialog"><DialogHeader><DialogTitle>폴더 그대로 다운로드</DialogTitle><DialogDescription>현재 선택한 폴더부터 시작하는 ZIP 파일로 받습니다. 완료 후에도 다시 다운로드할 수 있습니다.</DialogDescription></DialogHeader><div className="export-summary"><Archive size={30}/><div><strong>{(exportFolder?folderLabel(exportFolder):'')||[region,date].filter(Boolean).join(' / ')||'모든 지역과 날짜'}</strong><p>전체 {summary.schedules}개 일정 폴더 · {summary.fieldPhotos}장 · {formatBytes(summary.fieldBytes)}</p></div></div><div className="export-path"><FolderIcon size={17}/>{view==='address'?'일반건물·구분건물 / 주소 / 동·호수 / 사진 (날짜 폴더 없음)':'날짜 / 기존 일정 폴더 / 사진'}</div><p className="export-help">현재 보기의 폴더 구조로 현장 사진만 내려받습니다. 주소별 보기에서는 날짜 폴더 없이 같은 주소의 사진을 모읍니다. 파일명에 고유번호를 붙여 사진을 모두 보존합니다.</p><ArchiveDownload key={exportQuery.toString()} onStatusChanged={ids=>refreshOperationMetadata(ids,{region:region||undefined,date:view==='date'?date||undefined:undefined})} name={exportFolder?exportFolderLabel(exportFolder):date||region||'현장사진_전체'} query={exportQuery} folderCounts={{total:summary.schedules,withPhotos:summary.withFieldPhotos}} onComplete={()=>{cache.current.invalidate(key=>new URL(key).searchParams.has('usageOnly'));void auxiliary();}}/></DialogContent></Dialog>
    {drawingPhoto&&<Suspense fallback={<div role="status">도면 편집기를 불러오는 중…</div>}><DrawingEditor key={drawingPhoto.id} photo={drawingPhoto} onClose={()=>setDrawingPhoto(null)}/></Suspense>}
    {editingSchedule&&<EditSchedule key={editingSchedule.id} folder={editingSchedule} onClose={()=>setEditingSchedule(null)} onSaved={async updated=>{
      setFolders(previous=>previous.map(f=>f.id===updated.id?{...f,...updated,count:f.count,bytes:f.bytes,photoCount:f.photoCount,photoBytes:f.photoBytes,drawingCount:f.drawingCount}:f));
      setEditingSchedule(null);navigationGuard.current.editingSchedule=false;
      location(updated.region,updated.date,updated.id,view==='address'?addressParts(updated,true).map(p=>p.key):[]);
      await refresh(updated.id,true);
    }}/>}
    {importing&&<ImportSchedule open manual={manualImport} initialRegion={region||''} initialDate={date||''} onClose={()=>setImporting(false)} onSaved={(r,d)=>{cache.current.invalidate();setImporting(false);const same=locationUrl(r,d,null)===window.location.pathname+window.location.search+window.location.hash;location(r,d);if(same)void refresh(null,true);}}/>}
    <AlertDialog open={folderDelete} onOpenChange={open=>{if(!folderDeleteBusy)setFolderDelete(open);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 폴더를 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{active?active.date+' · '+folderLabel(active):[region,date].filter(Boolean).join(' / ')}<br/>{active?1:summary.schedules}개 일정 폴더 · {active?active.count:summary.photos}장의 사진이 영구 삭제됩니다. {!active&&'이 범위의 일정표 원본도 함께 삭제됩니다.'} 마지막 건물 폴더를 삭제하면 해당 날짜의 일정표 원본도 함께 삭제됩니다. 삭제한 자료는 복구할 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={folderDeleteBusy}>취소</AlertDialogCancel><AlertDialogAction disabled={folderDeleteBusy} onClick={e=>{e.preventDefault();void removeFolder();}}>{folderDeleteBusy?'삭제 중…':'폴더와 자료 삭제'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!deleteBusy)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 사진을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{deleting?.filename}<br/>보관함에서 원본이 영구 삭제되며 휴대폰과 PC 모두에서 사라집니다. 기기에 있는 사진은 삭제되지 않습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>취소</AlertDialogCancel><AlertDialogAction disabled={deleteBusy} onClick={e=>{e.preventDefault();void removePhoto();}}>{deleteBusy?'삭제 중…':'사진 삭제'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
