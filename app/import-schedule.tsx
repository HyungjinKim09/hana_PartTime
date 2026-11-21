"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {CloudUpload,Plus,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import type {ScheduleDraft} from '@/lib/types';
import {validateSchedule} from '@/lib/schedule-input';
import {rasterFile} from '@/lib/raster-file';
import {checkSchedulePhotos,mergeSchedulePages,schedulePhotoLimit,scheduleTeamLabel} from '@/lib/schedule-pages';
import {ScheduleTeamSelect} from './schedule-team-select';
import {readScheduleDraft,writeScheduleDraft,removeScheduleDraft} from '@/lib/schedule-draft';
import {scheduleFieldErrors} from '@/lib/schedule-validation';
import {ScheduleField} from './schedule-field';
import {createScheduleSubmission} from '@/lib/schedule-submission';
const emptyRow=()=>({lot:'',unit:'',time:'',name:'',phones:[],address:'',notes:'',group:1});
export function ImportSchedule({open,owner,manual=false,initialRegion='',initialDate='',onClose,onSaved}:{open:boolean;owner:string;manual?:boolean;initialRegion?:string;initialDate?:string;onClose:()=>void;onSaved:(region:string,date:string,team?:number)=>void}){
  const [photos,setPhotos]=useState<{file:File;url:string}[]>([]),[pageIndex,setPageIndex]=useState(0);
  const [draft,setDraft]=useState<ScheduleDraft|null>(()=>manual?{region:initialRegion,date:initialDate,folders:[emptyRow()],warnings:[]}:null),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),objectUrls=useRef<string[]>([]);
  const [enlarged,setEnlarged]=useState(false);
  const [draftReady,setDraftReady]=useState(false),[draftNotice,setDraftNotice]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [submission]=useState(()=>createScheduleSubmission<{region:string;date:string;team?:number;added:number;existing:number}>());
  const saveRunning=useRef(false);
  const inputsDisabled=saving||submitted||!draftReady;
  const persistence=useRef<Promise<unknown>>(Promise.resolve()),cleared=useRef(false);
  const recognition=useRef<AbortController|null>(null),retryFiles=useRef<File[]>([]);
  const [canRetry,setCanRetry]=useState(false);
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({}),[focusErrors,setFocusErrors]=useState(0);
  const formElement=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    if(!focusErrors)return;
    const invalid=formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if(!invalid)return;
    const collapsed=invalid.closest('details');
    if(collapsed&&!collapsed.open){collapsed.open=true;requestAnimationFrame(()=>invalid.focus());}
    else invalid.focus();
  },[focusErrors]);
  useEffect(()=>()=>recognition.current?.abort(),[]);
  const [initial]=useState(()=>JSON.stringify(draft));
  const dirty=!!photos.length||JSON.stringify(draft)!==initial;
  const latestSnapshot=useRef<{draft:ScheduleDraft|null;photos:File[];dirty:boolean}>({draft,photos:[],dirty:false});
  useEffect(()=>{latestSnapshot.current={draft,photos:photos.map(photo=>photo.file),dirty};},[draft,photos,dirty]);
  useEffect(()=>()=>{
    if(cleared.current)return;
    const latest=latestSnapshot.current;
    if(!latest.draft||!latest.dirty)return;
    const snapshot={draft:latest.draft,photos:latest.photos};
    persistence.current=writeScheduleDraft(owner,manual,snapshot);
    void persistence.current.catch(()=>{});
  },[owner,manual]);
  useEffect(()=>{
    let active=true;
    void readScheduleDraft(owner,manual).then(saved=>{
      if(!active||!saved)return;
      const restored=saved.photos.map(file=>({file,url:URL.createObjectURL(file)}));
      objectUrls.current=restored.map(photo=>photo.url);setPhotos(restored);setDraft(saved.draft);
      retryFiles.current=saved.photos;setCanRetry(saved.photos.length>0);
      setDraftNotice('이 기기에 보관한 작성 중 일정을 복원했습니다.');
    }).catch(()=>{if(active)setDraftNotice('초안 복구를 사용할 수 없습니다. 창을 닫기 전에 저장해 주세요.');}).finally(()=>{if(active)setDraftReady(true);});
    return()=>{active=false;};
  },[owner,manual]);
  function persist(){
    const latest=latestSnapshot.current;
    if(!latest.draft||cleared.current)return persistence.current;
    const snapshot={draft:latest.draft,photos:latest.photos};
    const job=writeScheduleDraft(owner,manual,snapshot);
    persistence.current=job;return job;
  }
  useEffect(()=>{
    if(!draftReady||!dirty||!draft||cleared.current)return;
    const snapshot={draft,photos:photos.map(photo=>photo.file)};
    const timer=setTimeout(()=>{
      if(cleared.current)return;
      persistence.current=writeScheduleDraft(owner,manual,snapshot);
      void persistence.current.catch(()=>setDraftNotice('초안 기기 보관에 실패했습니다. 창을 닫기 전에 저장해 주세요.'));
    },300);
    return()=>clearTimeout(timer);
  },[draftReady,dirty,draft,photos,owner,manual]);
  useEffect(()=>{if(!dirty&&!busy&&!saving&&!submitted)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,busy,saving,submitted]);
  async function close(){
    if(busy||saving||saveRunning.current||!draftReady)return;
    if(submission.hasSubmitted()){await save();return;}
    if(dirty){
      try{await persist();}catch{if(!window.confirm('초안을 기기에 보관하지 못했습니다. 작성 내용을 버리고 닫을까요?'))return;onClose();return;}
      if(!window.confirm('작성 중인 일정은 이 기기에 보관됩니다. 창을 닫을까요?'))return;
    }
    onClose();
  }
  async function discard(){
    if(submission.hasSubmitted()||saveRunning.current)return;
    if(!window.confirm('이 기기에 보관한 작성 중 일정을 버릴까요?'))return;
    cleared.current=true;
    try{await persistence.current.catch(()=>{});await removeScheduleDraft(owner,manual);onClose();}
    catch{cleared.current=false;setError('초안을 지우지 못했습니다. 다시 시도해 주세요.');}
  }
  const selectedPhoto=photos[pageIndex];
  const teams=Map.groupBy(draft?.folders.map((folder,index)=>({folder,index}))??[],entry=>entry.folder.group);
  const showTeams=!manual&&(teams.size>1||!teams.has(1));
  const teamOptions=Array.from({length:Math.min(20,Math.max(2,...teams.keys())+1)},(_,i)=>i+1);
  useEffect(()=>()=>{for(const url of objectUrls.current)URL.revokeObjectURL(url);},[]);
  async function choose(files:File[]){
    if(!draftReady||busy||saving||submission.hasSubmitted()||saveRunning.current)return;
    if(dirty&&!window.confirm('원본 사진을 다시 인식하면 작성 중인 내용을 바꿉니다. 계속할까요?'))return;
    setBusy(true);setError('');setProgress(0);
    const task=new AbortController();recognition.current=task;
    try{
      checkSchedulePhotos(files);
      const checked:File[]=[];
      for(const file of files){
        const photo=await rasterFile(file);
        task.signal.throwIfAborted();
        if(typeof createImageBitmap==='function'){const bitmap=await createImageBitmap(photo);bitmap.close();}
        checked.push(photo);
      }
      retryFiles.current=checked;setCanRetry(true);
      const drafts:ScheduleDraft[]=[];
      for(const [index,file] of checked.entries()){
        try{
          const {recognizeSchedulePhoto}=await import('@/lib/schedule-recognition');
          const page=await recognizeSchedulePhoto(file,value=>{if(!task.signal.aborted)setProgress((index+value/100)/checked.length*100);},{signal:task.signal});
          if(!page.folders.length){page.folders=[emptyRow()];page.warnings.unshift('읽은 일정이 없습니다. 원본에서 이 페이지의 일정을 직접 입력해 주세요.');}
          drafts.push(page);
        }catch(e){
          task.signal.throwIfAborted();
          if(draft)throw e;
          drafts.push({region:'',date:'',folders:[emptyRow()],warnings:[e instanceof Error?e.message:'일정을 읽지 못했습니다. 원본을 보며 직접 입력해 주세요.']});
        }
        setProgress((index+1)/checked.length*100);
      }
      const result=mergeSchedulePages(drafts);
      task.signal.throwIfAborted();
      for(const url of objectUrls.current)URL.revokeObjectURL(url);
      const next=checked.map(file=>({file,url:URL.createObjectURL(file)}));
      objectUrls.current=next.map(photo=>photo.url);setPhotos(next);
      setDraft({...result,region:result.region||initialRegion,date:result.date||initialDate});
      setPageIndex((result.folders[0]?.sourcePage??1)-1);
    }catch(e){setError(task.signal.aborted?'인식을 취소했습니다. 기존 작성 내용은 유지됩니다.':e instanceof Error?e.message:'사진을 읽지 못했습니다.');}
    finally{if(recognition.current===task){recognition.current=null;setBusy(false);}}
  }
  function row(index:number,key:string,value:unknown){
    setDraft(d=>d?{...d,folders:d.folders.map((f,i)=>i===index?{...f,[key]:value}:f)}:d);
    const fieldPath=`folders.${index}.${key}`;
    setFieldErrors(previous=>{if(!(fieldPath in previous))return previous;const next={...previous};delete next[fieldPath];return next;});
  }
  function editHeader(key:'region'|'date',value:string){setDraft(d=>d?{...d,[key]:value}:d);setFieldErrors(previous=>Object.fromEntries(Object.entries(previous).filter(([path])=>path!==key)));}
  function removeRow(index:number){
    setDraft(current=>current?{...current,folders:current.folders.filter((_,i)=>i!==index)}:current);
    setFieldErrors(previous=>Object.fromEntries(Object.entries(previous).filter(([path])=>!path.startsWith('folders.'))));
  }
  async function save(){
    if(!draftReady||!draft||(!manual&&!photos.length)||saveRunning.current||busy)return;
    let checked:ReturnType<typeof validateSchedule>|undefined;
    if(!submission.hasSubmitted()){
      try{checked=validateSchedule(draft);}catch(e){setFieldErrors(scheduleFieldErrors(e));setFocusErrors(value=>value+1);setError('표시된 입력 항목을 확인해 주세요.');return;}
    }
    setFieldErrors({});
    saveRunning.current=true;setSaving(true);setError('');
    try{
      const result=await submission.finish(async()=>{
        if(!checked)throw new Error('저장할 일정을 확인해 주세요.');
        const form=new FormData();for(const {file} of photos)form.append('photo',file);form.set('schedule',JSON.stringify(checked));
        const r=await fetch('/api/schedules',manual?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked)}:{method:'POST',body:form});
        const data=await r.json() as {error?:string;region:string;date:string;added:number;existing:number};
        if(!r.ok)throw new Error(data.error||'등록하지 못했어요.');
        const team=checked.folders[0]?.team??0;
        const singleTeam=manual&&checked.folders.every(folder=>(folder.team??0)===team);
        return {...data,team:singleTeam?team:undefined};
      },async()=>{
        await persistence.current.catch(()=>{});
        await removeScheduleDraft(owner,manual);
      },result=>{
        cleared.current=true;setSubmitted(true);setDraftNotice('');
        toast.success(`${result.added}개 폴더 생성${result.existing?` · 기존 ${result.existing}개 폴더 연결`:''}`);
      });
      onSaved(result.region,result.date,result.team);setDraft(null);setPhotos([]);
    }catch(e){
      setError(submission.hasSubmitted()?'일정은 서버에 저장됐지만 이 기기의 초안을 지우지 못했습니다. 초안 정리를 다시 시도해 주세요. 이 창을 닫거나 새로고침하면 저장된 초안이 다시 보일 수 있습니다.':e instanceof Error?e.message:'연결을 확인하고 다시 시도해 주세요.');
    }finally{saveRunning.current=false;setSaving(false);}
  }
  return <Dialog open={open} onOpenChange={v=>{if(!v)void close();}}><DialogContent className="schedule-dialog" onInteractOutside={e=>e.preventDefault()}><DialogHeader><DialogTitle>{manual?'일정 직접 추가':'일정표 사진으로 폴더 만들기'}</DialogTitle><DialogDescription>{manual?'사진 없이 일정을 입력합니다. 기존 날짜에 일정을 추가하거나 새 지역·날짜로 등록할 수 있습니다.':'지역 → 조사 날짜 → 번지별 일정 순서로 저장합니다. 일정표 원본도 함께 보관됩니다.'}</DialogDescription></DialogHeader>
    {!draftReady&&<p role="status">작성 중인 일정을 확인하고 있어요.</p>}
    {draftNotice&&<p role="status" className="review-hint">{draftNotice}</p>}
    {submitted&&<p role="status" className="review-hint">{saving?'일정 저장은 완료됐습니다. 이 기기에 남은 초안을 정리하고 있어요.':'일정 저장은 완료됐습니다. 이 기기에 남은 초안을 정리해 주세요.'}</p>}
    {submitted&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>void save()}>{saving?'초안 정리 중…':'초안 정리 다시 시도'}</button>}
    {draftReady&&dirty&&!busy&&!saving&&!submitted&&<button type="button" className="subtle-button" onClick={()=>void discard()}>작성 중인 초안 버리기</button>}
    {!manual&&!photos.length&&!busy&&!submitted&&<button type="button" className="schedule-pick" disabled={inputsDisabled} onClick={()=>input.current?.click()}><CloudUpload size={32}/><strong>일정표 사진 선택</strong><span>JPG · PNG · WEBP · 최대 {schedulePhotoLimit}장, 전체 20MB</span><small>CLOVA 연결 시 일정표를 네이버 클라우드로 전송해 읽습니다.</small></button>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={inputsDisabled} onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length)void choose(files);e.target.value='';}}/>
    {busy&&<div className="ocr-status"><strong>지역·날짜·호수별 일정을 읽고 있어요</strong><p>인식이 끝나면 원본과 비교하고 수정할 수 있어요.</p><Progress value={progress} aria-label="일정표 인식 진행률"/><span>{Math.round(progress)}%</span><button type="button" className="secondary-button" onClick={()=>recognition.current?.abort()}>인식 취소</button></div>}
    {!manual&&!busy&&canRetry&&!submitted&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>void choose(retryFiles.current)}>선택한 사진 다시 인식</button>}
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {!busy&&draft&&draft.warnings.length>0&&<div role="status" className="review-hint">{draft.warnings.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
    {!manual&&!busy&&!draft&&photos.length>0&&<button type="button" className="secondary-button" onClick={()=>input.current?.click()}>사진 다시 선택</button>}
    {(manual||selectedPhoto)&&!busy&&draft&&<form ref={formElement} className={manual?'manual-layout':'import-layout'} noValidate onSubmit={event=>{event.preventDefault();void save();}}>
      {!manual&&selectedPhoto&&<div className="schedule-original">{photos.length>1&&<div className="schedule-edit-actions" role="group" aria-label="일정표 원본 선택">{photos.map((photo,i)=><button key={photo.url} type="button" className={pageIndex===i?'primary-button':'secondary-button'} aria-pressed={pageIndex===i} title={photo.file.name} onClick={()=>setPageIndex(i)}>사진 {i+1}</button>)}</div>}<button type="button" className="subtle-button" onClick={()=>setEnlarged(true)}><img src={selectedPhoto.url} alt={'등록할 일정표 원본 사진 '+(pageIndex+1)}/></button><button type="button" className="subtle-button" disabled={inputsDisabled} onClick={()=>input.current?.click()}>사진 다시 선택</button><small>원본을 누르면 크게 볼 수 있어요.</small></div>}
      <div className="schedule-review">
        <div className="review-top">
          <ScheduleField path="region" label="지역 폴더" value={draft.region} errors={fieldErrors} required maxLength={100} placeholder="예: 사직4구역" disabled={inputsDisabled} onChange={value=>editHeader('region',value)}/>
          <ScheduleField path="date" label="조사 날짜" value={draft.date} errors={fieldErrors} required type="date" disabled={inputsDisabled} onChange={value=>editHeader('date',value)}/>
        </div>
        <p className="review-hint">{manual?'지역·조사 날짜·번지는 필수입니다. 같은 번지라도 건물·호수가 다르면 별도 일정으로 저장합니다.':'사진을 올린 날짜가 아닌, 일정표에 적힌 날짜를 확인해 주세요. 같은 번지라도 건물·호수가 다르면 별도 일정으로 저장합니다. 이름·연락처 등 인식 내용을 원본과 확인해 주세요.'}</p>
        <h3>번지별 일정 <span>{draft.folders.length}개</span></h3>
        {[...teams].sort(([a],[b])=>a-b).map(([team,items])=><section key={team} className="schedule-team-review">
          {showTeams&&<h4>{scheduleTeamLabel(team)} · {items.length}개 일정</h4>}
          {items.map(({folder:f,index:i})=>{
            const groupPath=`folders.${i}.group`,groupError=fieldErrors[groupPath],groupId=`schedule-group-${i}`;
            return <fieldset className="review-row" key={i} disabled={inputsDisabled}>
              <legend>{showTeams?`${scheduleTeamLabel(f.group)} ${f.sourceNumber??i+1}번`:`일정 ${i+1}`}{photos.length>1&&f.sourcePage?' · 사진 '+f.sourcePage:''}{!showTeams&&f.sourceNumber&&f.sourceNumber!==i+1?' · 원본 '+f.sourceNumber+'번':''}</legend>
              {manual?<ScheduleTeamSelect id={`folders.${i}.team`} name={`folders.${i}.team`} label="조사 팀" error={fieldErrors[`folders.${i}.team`]} value={f.team??null} disabled={inputsDisabled} onChange={value=>row(i,'team',value)}/>:<label htmlFor={groupId} className="schedule-field">조사 팀<select id={groupId} name={groupPath} value={f.group} aria-invalid={groupError?true:undefined} aria-describedby={groupError?groupId+'-error':undefined} onChange={event=>row(i,'group',Number(event.target.value))}>{teamOptions.map(option=><option key={option} value={option}>{scheduleTeamLabel(option)}</option>)}</select>{groupError&&<small id={groupId+'-error'} className="field-error">{groupError}</small>}</label>}
              <div className="review-top">
                <ScheduleField path={`folders.${i}.lot`} label="번지 / 일정 폴더" value={f.lot} errors={fieldErrors} required maxLength={100} placeholder="사직동 158-22" disabled={inputsDisabled} onChange={value=>row(i,'lot',value)}/>
                <ScheduleField path={`folders.${i}.time`} label="방문 시간" value={f.time} errors={fieldErrors} maxLength={100} placeholder="예: 10:00" disabled={inputsDisabled} onChange={value=>row(i,'time',value)}/>
                <button type="button" className="subtle-button" aria-label={`일정 ${i+1} 삭제`} disabled={inputsDisabled} onClick={()=>removeRow(i)}><Trash2 size={17}/></button>
              </div>
              <ScheduleField path={`folders.${i}.unit`} label="건물·호수 (같은 번지의 일정 구분)" value={f.unit||''} errors={fieldErrors} maxLength={100} placeholder="예: 배산301호" disabled={inputsDisabled} onChange={value=>row(i,'unit',value)}/>
              <details open={manual||undefined}>
                <summary>이름·연락처·주소·메모</summary>
                <ScheduleField path={`folders.${i}.name`} label="연락 대상" value={f.name} errors={fieldErrors} maxLength={100} disabled={inputsDisabled} onChange={value=>row(i,'name',value)}/>
                <ScheduleField path={`folders.${i}.phones`} label="전화번호 (여러 개는 쉼표로 구분)" value={f.phones.join(',')} errors={fieldErrors} maxLength={810} type="tel" placeholder="예: 010-1234-5678, 010-2345-6789" disabled={inputsDisabled} onChange={value=>row(i,'phones',value.split(','))}/>
                <ScheduleField path={`folders.${i}.address`} label="주소" value={f.address} errors={fieldErrors} maxLength={300} disabled={inputsDisabled} onChange={value=>row(i,'address',value)}/>
                <ScheduleField path={`folders.${i}.notes`} label="조사 메모" value={f.notes} errors={fieldErrors} maxLength={3000} multiline disabled={inputsDisabled} onChange={value=>row(i,'notes',value)}/>
              </details>
            </fieldset>;
          })}
        </section>)}
        <button type="button" className="secondary-button" disabled={inputsDisabled||draft.folders.length>=100} onClick={()=>setDraft({...draft,folders:[...draft.folders,emptyRow()]})}><Plus size={16}/>일정 추가</button>
      </div>
      <div className="import-footer"><p>같은 지역·날짜·번지·건물·호수만 기존 폴더에 연결합니다. 서로 다른 호수의 사진은 별도로 보관합니다.</p>{!submitted&&<button type="submit" className="primary-button" disabled={inputsDisabled||!draft.folders.length}>{saving?'저장 중…':`${draft.folders.length}개 일정 저장`}</button>}</div>
    </form>}
  </DialogContent><Dialog open={enlarged&&open} onOpenChange={setEnlarged}><DialogContent className="schedule-dialog"><DialogHeader><DialogTitle>일정표 원본 크게 보기</DialogTitle><DialogDescription>사진을 확대해 내용을 확인하세요.</DialogDescription></DialogHeader>{selectedPhoto&&<img src={selectedPhoto.url} alt="일정표 원본 확대" style={{width:'100%',maxHeight:'75dvh',objectFit:'contain'}}/>}</DialogContent></Dialog></Dialog>;
}
