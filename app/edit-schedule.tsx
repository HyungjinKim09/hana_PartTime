"use client";
import {useEffect,useRef,useState} from 'react';
import {Save} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import type {Folder} from '@/lib/types';
import {validateScheduleEdit} from '@/lib/schedule-input';

const fields=[['region','지역 폴더'],['date','조사 날짜'],['lot','번지'],['unit','건물·동·호수'],['time','방문 시간'],['name','연락 대상'],['phones','전화번호'],['address','도로명 주소'],['notes','방문 전 확인사항']] as const;
type Form=Record<typeof fields[number][0],string>;
function values(folder:Folder):Form{return {region:folder.region,date:folder.date,lot:folder.lot,unit:folder.unitDisplay||folder.unit||'',time:folder.time,name:folder.name,phones:folder.phones.join(', '),address:folder.address,notes:folder.notes};}

export function EditSchedule({folder,onClose,onSaved}:{folder:Folder;onClose:()=>void;onSaved:(folder:Folder)=>Promise<void>}){
  const [form,setForm]=useState(()=>values(folder)),[baseline,setBaseline]=useState(()=>values(folder));
  const [revision,setRevision]=useState(folder.revision||1),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [conflict,setConflict]=useState<Folder|null>(null),[discard,setDiscard]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);
  const lock=useRef(false),dirty=JSON.stringify(form)!==JSON.stringify(baseline);
  useEffect(()=>{if(error||conflict)dialog.current?.scrollTo({top:0,behavior:'smooth'});},[error,conflict]);
  useEffect(()=>{
    if(!dirty&&!saving)return;
    const warn=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirty,saving]);
  function close(){if(lock.current)return;if(dirty)setDiscard(true);else onClose();}
  function reconcile(merge:boolean){
    if(!conflict)return;const latest=values(conflict),next={...latest};
    if(merge)for(const [key] of fields)if(form[key]!==baseline[key])next[key]=form[key];
    setForm(next);setBaseline(latest);setRevision(conflict.revision||1);setConflict(null);setError('');
  }
  async function save(){
    if(lock.current||conflict)return;
    const request={id:folder.id,revision,...form,phones:form.phones.split(',').map(p=>p.trim()).filter(Boolean)};
    try{validateScheduleEdit(request);}
    catch{setError('지역·조사 날짜·번지를 입력하고, 날짜와 건물·호수를 확인해 주세요.');return;}
    lock.current=true;setSaving(true);setError('');
    try{
      const r=await fetch('/api/schedules',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      const data=await r.json() as {error?:string;folder:Folder;latest?:Folder};
      if(!r.ok){if(r.status===409&&data.latest)setConflict(data.latest);throw new Error(data.error||'일정을 저장하지 못했습니다.');}
      setBaseline(form);toast.success('일정을 수정했습니다.');await onSaved(data.folder);
    }catch(e){setError(e instanceof Error?e.message:'연결을 확인한 뒤 다시 저장해 주세요.');}
    finally{lock.current=false;setSaving(false);}
  }
  return <><Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent ref={dialog} className="schedule-dialog edit-schedule-dialog" showCloseButton={!saving} onInteractOutside={e=>e.preventDefault()}><DialogHeader><DialogTitle>일정 수정</DialogTitle><DialogDescription>{folder.date} · {folder.lot}{folder.unitDisplay||folder.unit?` · ${folder.unitDisplay||folder.unit}`:''}<br/>선택한 일정의 정보만 수정합니다. 사진·도면과 조사 상태·비고는 유지됩니다.</DialogDescription></DialogHeader>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {conflict&&<section className="review-hint schedule-edit-conflict" role="alert"><strong>다른 기기에 저장된 최신 내용</strong><dl>{fields.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{values(conflict)[key]||'미입력'}</dd></div>)}</dl><p>작성한 내용은 아래에 남아 있습니다. 합친 뒤에는 내용을 확인하고 다시 저장하세요.</p><div className="schedule-edit-actions"><button className="secondary-button" type="button" onClick={()=>reconcile(false)}>최신 내용 불러오기</button><button className="secondary-button" type="button" onClick={()=>reconcile(true)}>내 수정사항 합쳐 검토</button></div></section>}
    <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="schedule-review schedule-edit-fields" disabled={saving}>
      {fields.map(([key,label])=><label key={key} className={['unit','phones','address','notes'].includes(key)?'wide-field':''}>{label}{['region','date','lot'].includes(key)&&' *'}
        {key==='notes'?<textarea rows={4} maxLength={3000} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/>:<input type={key==='date'?'date':'text'} required={['region','date','lot'].includes(key)} maxLength={key==='phones'?810:key==='address'?300:100} value={form[key]} placeholder={key==='time'?'예: 10:00, 오전중, 오후중, 아무때나':key==='phones'?'여러 개는 쉼표로 구분':key==='unit'?'예: 영미주택 B동 402호':undefined} onChange={e=>setForm({...form,[key]:e.target.value})}/>}
      </label>)}
    </fieldset>
    {(form.region!==baseline.region||form.date!==baseline.date)&&<p className="review-hint">저장하면 이 일정과 사진이 변경한 지역·날짜에 표시됩니다. 일정표 원본 사진의 내용은 바뀌지 않습니다.</p>}
    <div className="import-footer"><p>* 필수 항목 · 전화번호는 쉼표로 구분합니다.</p><div className="schedule-edit-actions"><button type="button" className="secondary-button" disabled={saving} onClick={close}>취소</button><button type="submit" className="primary-button" disabled={saving||!dirty||!!conflict}><Save size={16}/>{saving?'저장 중…':'수정 저장'}</button></div></div>
    </form>
  </DialogContent></Dialog><AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>수정을 취소할까요?</AlertDialogTitle><AlertDialogDescription>저장하지 않은 수정만 사라집니다. 기존 일정과 사진은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>계속 수정</AlertDialogCancel><AlertDialogAction onClick={onClose}>수정 취소하고 닫기</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
