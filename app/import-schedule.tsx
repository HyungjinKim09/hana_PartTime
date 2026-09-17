"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Progress} from '@/components/ui/progress';
import {CloudUpload,Plus,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import type {ScheduleDraft} from '@/lib/types';
import {validateSchedule} from '@/lib/schedule-input';
const emptyRow=()=>({lot:'',time:'',name:'',phones:[],address:'',notes:'',group:1});
export function ImportSchedule({open,onClose,onSaved}:{open:boolean;onClose:()=>void;onSaved:(region:string,date:string)=>void}){
  const [file,setFile]=useState<File|null>(null),[url,setUrl]=useState(''),[draft,setDraft]=useState<ScheduleDraft|null>(null),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!file){setUrl('');return;}const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u);},[file]);
  async function choose(f:File){
    if(f.size>20*1024*1024){setError('한 장당 20MB까지 올릴 수 있어요.');return;}
    setFile(f);setDraft(null);setError('');setBusy(true);setProgress(0);
    try{const {recognizeSchedule}=await import('@/lib/schedule-ocr');const result=await recognizeSchedule(f,setProgress);if(!result.folders.length)result.folders=[emptyRow()];setDraft(result);}
    catch{setError('글자를 읽지 못했어요. 원본을 보며 지역·날짜·번지를 입력하면 등록할 수 있어요.');setDraft({region:'',date:'',folders:[emptyRow()],warnings:[]});}
    finally{setBusy(false);}
  }
  function row(index:number,key:string,value:unknown){setDraft(d=>d?{...d,folders:d.folders.map((f,i)=>i===index?{...f,[key]:value}:f)}:d);}
  async function save(){
    if(!draft||!file)return;
    let checked;try{checked=validateSchedule(draft);}catch{setError('지역, 조사 날짜, 모든 번지 이름을 확인해 주세요.');return;}
    setSaving(true);setError('');
    try{const form=new FormData();form.set('photo',file);form.set('schedule',JSON.stringify(checked));const r=await fetch('/api/schedules',{method:'POST',body:form});const data=await r.json() as {error?:string;region:string;date:string;added:number;existing:number};if(!r.ok)throw new Error(data.error||'등록하지 못했어요.');toast.success(`${data.added}개 폴더 생성${data.existing?` · 기존 ${data.existing}개 폴더 연결`:''}`);onSaved(data.region,data.date);setDraft(null);setFile(null);}
    catch(e){setError(e instanceof Error?e.message:'연결을 확인하고 다시 시도해 주세요.');}finally{setSaving(false);}
  }
  return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy&&!saving)onClose();}}><DialogContent className="schedule-dialog" onInteractOutside={e=>{if(busy||saving)e.preventDefault();}}><DialogHeader><DialogTitle>일정표 사진으로 폴더 만들기</DialogTitle><DialogDescription>지역 → 조사 날짜 → 번지별 일정 순서로 저장합니다. 일정표 원본도 함께 보관됩니다.</DialogDescription></DialogHeader>
    {!file&&<button className="schedule-pick" onClick={()=>input.current?.click()}><CloudUpload size={32}/><strong>일정표 사진 선택</strong><span>JPG · PNG · WEBP · 한 장당 20MB</span></button>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{if(e.target.files?.[0])void choose(e.target.files[0]);e.target.value='';}}/>
    {busy&&<div role="status" className="ocr-status"><strong>일정표의 지역·날짜·번지를 읽고 있어요</strong><p>처음에는 인식 도구를 준비하느라 조금 더 걸릴 수 있어요.</p><Progress value={progress}/><span>{progress}% · 이 창을 열어두세요.</span></div>}
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {file&&!busy&&draft&&<><div className="import-layout"><div className="schedule-original"><a href={url} target="_blank" rel="noopener"><img src={url} alt="등록할 일정표 원본"/></a><button className="subtle-button" disabled={saving} onClick={()=>input.current?.click()}>다른 사진 선택</button><small>원본을 누르면 크게 볼 수 있어요.</small></div><div className="schedule-review"><div className="review-top"><label>지역 폴더<input value={draft.region} placeholder="예: 사직4구역" disabled={saving} onChange={e=>setDraft({...draft,region:e.target.value})}/></label><label>일정표의 조사 날짜<input type="date" value={draft.date} disabled={saving} onChange={e=>setDraft({...draft,date:e.target.value})}/></label></div><p className="review-hint">사진을 올린 날짜가 아닌, 일정표에 적힌 날짜를 확인해 주세요. 시간·연락처·메모는 직접 입력할 수 있어요.</p><h3>번지별 일정 <span>{draft.folders.length}개</span></h3>
    {draft.folders.map((f,i)=><fieldset className="review-row" key={i} disabled={saving}><legend>일정 {i+1}</legend><div className="review-top"><label>번지 / 일정 폴더<input value={f.lot} placeholder="사직동 158-22" onChange={e=>row(i,'lot',e.target.value)}/></label><label>방문 시간<input value={f.time} placeholder="예: 10:00" onChange={e=>row(i,'time',e.target.value)}/></label><button className="subtle-button" aria-label={`일정 ${i+1} 삭제`} onClick={()=>setDraft({...draft,folders:draft.folders.filter((_,j)=>j!==i)})}><Trash2 size={17}/></button></div><details><summary>연락처·주소·메모 추가</summary><label>연락 대상<input value={f.name} onChange={e=>row(i,'name',e.target.value)}/></label><label>전화번호 (여러 개는 쉼표로 구분)<input value={f.phones.join(',')} onChange={e=>row(i,'phones',e.target.value.split(','))}/></label><label>주소<input value={f.address} onChange={e=>row(i,'address',e.target.value)}/></label><label>조사 메모<textarea value={f.notes} onChange={e=>row(i,'notes',e.target.value)}/></label></details></fieldset>)}
    <button className="secondary-button" disabled={saving||draft.folders.length>=100} onClick={()=>setDraft({...draft,folders:[...draft.folders,emptyRow()]})}><Plus size={16}/>일정 추가</button></div></div><div className="import-footer"><p>같은 지역·날짜·번지는 기존 폴더에 연결하며, 기존 사진과 일정 내용은 유지합니다.</p><button className="primary-button" disabled={saving||!draft.folders.length} onClick={()=>void save()}>{saving?'저장 중…':`${draft.folders.length}개 일정 확인 · 폴더 생성`}</button></div></>}
  </DialogContent></Dialog>;
}
