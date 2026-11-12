"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {CloudUpload,Plus,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import type {ScheduleDraft} from '@/lib/types';
import {validateSchedule} from '@/lib/schedule-input';
import {rasterFile} from '@/lib/raster-file';
import {checkSchedulePhotos,mergeSchedulePages,schedulePhotoLimit} from '@/lib/schedule-pages';
const emptyRow=()=>({lot:'',unit:'',time:'',name:'',phones:[],address:'',notes:'',group:1});
export function ImportSchedule({open,manual=false,initialRegion='',initialDate='',onClose,onSaved}:{open:boolean;manual?:boolean;initialRegion?:string;initialDate?:string;onClose:()=>void;onSaved:(region:string,date:string)=>void}){
  const [photos,setPhotos]=useState<{file:File;url:string}[]>([]),[pageIndex,setPageIndex]=useState(0);
  const [draft,setDraft]=useState<ScheduleDraft|null>(()=>manual?{region:initialRegion,date:initialDate,folders:[emptyRow()],warnings:[]}:null),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),objectUrls=useRef<string[]>([]);
  const [enlarged,setEnlarged]=useState(false);
  const selectedPhoto=photos[pageIndex];
  useEffect(()=>()=>{for(const url of objectUrls.current)URL.revokeObjectURL(url);},[]);
  async function choose(files:File[]){
    setBusy(true);setError('');setProgress(0);
    try{
      checkSchedulePhotos(files);
      const checked:File[]=[];
      for(const file of files){
        const photo=await rasterFile(file);
        if(typeof createImageBitmap==='function'){const bitmap=await createImageBitmap(photo);bitmap.close();}
        checked.push(photo);
      }
      for(const url of objectUrls.current)URL.revokeObjectURL(url);
      const next=checked.map(file=>({file,url:URL.createObjectURL(file)}));
      objectUrls.current=next.map(photo=>photo.url);
      setPhotos(next);setPageIndex(0);setDraft(null);
      const drafts:ScheduleDraft[]=[];
      for(const [index,file] of checked.entries()){
        try{
          const {recognizeSchedulePhoto}=await import('@/lib/schedule-recognition');
          const page=await recognizeSchedulePhoto(file,value=>setProgress((index+value/100)/checked.length*100));
          if(!page.folders.length){page.folders=[emptyRow()];page.warnings.unshift('읽은 일정이 없습니다. 원본에서 이 페이지의 일정을 직접 입력해 주세요.');}
          drafts.push(page);
        }catch(e){
          drafts.push({region:'',date:'',folders:[emptyRow()],warnings:[e instanceof Error?e.message:'일정을 읽지 못했습니다. 원본을 보며 직접 입력해 주세요.']});
        }
        setProgress((index+1)/checked.length*100);
      }
      const result=mergeSchedulePages(drafts);
      setDraft({...result,region:result.region||initialRegion,date:result.date||initialDate});
      setPageIndex((result.folders[0]?.sourcePage??1)-1);
    }catch(e){setError(e instanceof Error?e.message:'사진을 읽지 못했습니다.');}
    finally{setBusy(false);}
  }
  function row(index:number,key:string,value:unknown){setDraft(d=>d?{...d,folders:d.folders.map((f,i)=>i===index?{...f,[key]:value}:f)}:d);}
  async function save(){
    if(!draft||(!manual&&!photos.length)||saving)return;
    let checked;try{checked=validateSchedule(draft);}catch(e){setError(e instanceof Error&&!('issues' in e)?e.message:'지역, 조사 날짜, 번지와 건물·호수를 확인해 주세요.');return;}
    setSaving(true);setError('');
    try{const form=new FormData();for(const {file} of photos)form.append('photo',file);form.set('schedule',JSON.stringify(checked));const r=await fetch('/api/schedules',manual?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked)}:{method:'POST',body:form});const data=await r.json() as {error?:string;region:string;date:string;added:number;existing:number};if(!r.ok)throw new Error(data.error||'등록하지 못했어요.');toast.success(`${data.added}개 폴더 생성${data.existing?` · 기존 ${data.existing}개 폴더 연결`:''}`);onSaved(data.region,data.date);setDraft(null);setPhotos([]);}
    catch(e){setError(e instanceof Error?e.message:'연결을 확인하고 다시 시도해 주세요.');}finally{setSaving(false);}
  }
  return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy&&!saving)onClose();}}><DialogContent className="schedule-dialog" onInteractOutside={e=>{if(busy||saving)e.preventDefault();}}><DialogHeader><DialogTitle>{manual?'일정 직접 추가':'일정표 사진으로 폴더 만들기'}</DialogTitle><DialogDescription>{manual?'사진 없이 일정을 입력합니다. 기존 날짜에 일정을 추가하거나 새 지역·날짜로 등록할 수 있습니다.':'지역 → 조사 날짜 → 번지별 일정 순서로 저장합니다. 일정표 원본도 함께 보관됩니다.'}</DialogDescription></DialogHeader>
    {!manual&&!photos.length&&!busy&&<button className="schedule-pick" onClick={()=>input.current?.click()}><CloudUpload size={32}/><strong>일정표 사진 선택</strong><span>JPG · PNG · WEBP · 최대 {schedulePhotoLimit}장, 전체 20MB</span><small>CLOVA 연결 시 일정표를 네이버 클라우드로 전송해 읽습니다.</small></button>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length)void choose(files);e.target.value='';}}/>
    {busy&&<div role="status" className="ocr-status"><strong>지역·날짜·호수별 일정을 읽고 있어요</strong><p>인식이 끝나면 원본과 비교하고 수정할 수 있어요.</p><Progress value={progress}/><span>{Math.round(progress)}% · 이 창을 열어두세요.</span></div>}
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {!busy&&draft&&draft.warnings.length>0&&<div role="status" className="review-hint">{draft.warnings.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
    {!manual&&!busy&&!draft&&photos.length>0&&<button className="secondary-button" onClick={()=>input.current?.click()}>사진 다시 선택</button>}
    {(manual||selectedPhoto)&&!busy&&draft&&<><div className={manual?'manual-layout':'import-layout'}>{!manual&&selectedPhoto&&<div className="schedule-original">{photos.length>1&&<div className="schedule-edit-actions" role="group" aria-label="일정표 원본 선택">{photos.map((photo,i)=><button key={photo.url} type="button" className={pageIndex===i?'primary-button':'secondary-button'} aria-pressed={pageIndex===i} title={photo.file.name} onClick={()=>setPageIndex(i)}>사진 {i+1}</button>)}</div>}<button type="button" className="subtle-button" onClick={()=>setEnlarged(true)}><img src={selectedPhoto.url} alt={'등록할 일정표 원본 사진 '+(pageIndex+1)}/></button><button className="subtle-button" disabled={saving} onClick={()=>input.current?.click()}>사진 다시 선택</button><small>원본을 누르면 크게 볼 수 있어요.</small></div>}<div className="schedule-review"><div className="review-top"><label>지역 폴더<input value={draft.region} placeholder="예: 사직4구역" disabled={saving} onChange={e=>setDraft({...draft,region:e.target.value})}/></label><label>조사 날짜<input type="date" value={draft.date} disabled={saving} onChange={e=>setDraft({...draft,date:e.target.value})}/></label></div><p className="review-hint">{manual?'지역·조사 날짜·번지는 필수입니다. 같은 번지라도 건물·호수가 다르면 별도 일정으로 저장합니다.':'사진을 올린 날짜가 아닌, 일정표에 적힌 날짜를 확인해 주세요. 같은 번지라도 건물·호수가 다르면 별도 일정으로 저장합니다. 이름·연락처 등 인식 내용을 원본과 확인해 주세요.'}</p><h3>번지별 일정 <span>{draft.folders.length}개</span></h3>
    {draft.folders.map((f,i)=><fieldset className="review-row" key={i} disabled={saving}><legend>일정 {i+1}{photos.length>1&&f.sourcePage?' · 사진 '+f.sourcePage:''}{f.sourceNumber&&f.sourceNumber!==i+1?' · 원본 '+f.sourceNumber+'번':''}</legend><div className="review-top"><label>번지 / 일정 폴더<input value={f.lot} placeholder="사직동 158-22" onChange={e=>row(i,'lot',e.target.value)}/></label><label>방문 시간<input value={f.time} placeholder="예: 10:00" onChange={e=>row(i,'time',e.target.value)}/></label><button className="subtle-button" aria-label={`일정 ${i+1} 삭제`} onClick={()=>setDraft({...draft,folders:draft.folders.filter((_,j)=>j!==i)})}><Trash2 size={17}/></button></div><label>건물·호수 (같은 번지의 일정 구분)<input value={f.unit||''} placeholder="예: 배산301호" onChange={e=>row(i,'unit',e.target.value)}/></label><details open={manual||undefined}><summary>이름·연락처·주소·메모</summary><label>연락 대상<input value={f.name} onChange={e=>row(i,'name',e.target.value)}/></label><label>전화번호 (여러 개는 쉼표로 구분)<input value={f.phones.join(',')} onChange={e=>row(i,'phones',e.target.value.split(','))}/></label><label>주소<input value={f.address} onChange={e=>row(i,'address',e.target.value)}/></label><label>조사 메모<textarea value={f.notes} onChange={e=>row(i,'notes',e.target.value)}/></label></details></fieldset>)}
    <button className="secondary-button" disabled={saving||draft.folders.length>=100} onClick={()=>setDraft({...draft,folders:[...draft.folders,emptyRow()]})}><Plus size={16}/>일정 추가</button></div></div><div className="import-footer"><p>같은 지역·날짜·번지·건물·호수만 기존 폴더에 연결합니다. 서로 다른 호수의 사진은 별도로 보관합니다.</p><button className="primary-button" disabled={saving||!draft.folders.length} onClick={()=>void save()}>{saving?'저장 중…':`${draft.folders.length}개 일정 저장`}</button></div></>}
  </DialogContent><Dialog open={enlarged&&open} onOpenChange={setEnlarged}><DialogContent className="schedule-dialog"><DialogHeader><DialogTitle>일정표 원본 크게 보기</DialogTitle><DialogDescription>사진을 확대해 내용을 확인하세요.</DialogDescription></DialogHeader>{selectedPhoto&&<img src={selectedPhoto.url} alt="일정표 원본 확대" style={{width:'100%',maxHeight:'75dvh',objectFit:'contain'}}/>}</DialogContent></Dialog></Dialog>;
}
