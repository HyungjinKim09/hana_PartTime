"use client";
import {useEffect,useRef,useState} from 'react';
import {ClipboardCopy,FileText,Save,Download} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {Folder} from '@/lib/types';
import {buildingCategory} from '@/lib/daily-report';

export function FolderRemarks({folder,onDirty,onSaved}:{folder:Folder;onDirty:(dirty:boolean)=>void;onSaved:()=>Promise<void>}){
  const incoming=JSON.stringify({remarks:folder.remarks||'',buildingDetails:folder.buildingDetails||'',surveyStatus:folder.surveyStatus||'미완료'});
  const [form,setForm]=useState<{remarks:string;buildingDetails:string;surveyStatus:string}>(()=>JSON.parse(incoming));
  const baseline=useRef(incoming),dirty=useRef(false);const [changed,setChanged]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!dirty.current){baseline.current=incoming;setForm(JSON.parse(incoming));}},[incoming]);
  function edit(key:keyof typeof form,value:string){const next={...form,[key]:value};setForm(next);dirty.current=JSON.stringify(next)!==baseline.current;setChanged(dirty.current);onDirty(dirty.current);}
  async function save(){setBusy(true);try{const r=await fetch('/api/folders',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:folder.id,...form})});const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error||'저장하지 못했습니다.');baseline.current=JSON.stringify(form);dirty.current=false;setChanged(false);onDirty(false);toast.success('비고와 조사 상태를 저장했어요.');await onSaved();}catch(e){toast.error(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setBusy(false);}}
  return <section className="remarks-panel"><div className="section-heading"><h2><FileText size={20}/>비고 · 일일보고</h2><span className="building-badge">{buildingCategory(folder)}</span></div><fieldset disabled={busy}><div className="report-fields"><label>조사 상태<select value={form.surveyStatus} onChange={e=>edit('surveyStatus',e.target.value)}>{['미완료','완료','부분조사','미방문'].map(s=><option key={s}>{s}</option>)}</select></label><label>동수·층수 <span>(선택)</span><input maxLength={100} value={form.buildingDetails} placeholder="예: 1동3층" onChange={e=>edit('buildingDetails',e.target.value)}/></label></div><label>비고<textarea rows={5} maxLength={10000} value={form.remarks} onChange={e=>edit('remarks',e.target.value)} placeholder="현장에서 확인한 특이사항을 적어주세요. 비워두면 일일보고에 ‘특이사항 없음’으로 표시됩니다."/></label></fieldset><div className="remarks-footer"><p>{changed?'저장하지 않은 내용이 있어요.':'저장된 비고가 해당 날짜 일일보고의 특이사항으로 들어갑니다.'}</p>{changed&&<button className="secondary-button" disabled={busy} onClick={()=>{setForm(JSON.parse(baseline.current));dirty.current=false;setChanged(false);onDirty(false);}}>입력 취소</button>}<button className="primary-button" disabled={busy||!changed} onClick={()=>void save()}><Save size={16}/>{busy?'저장 중…':'비고 저장'}</button></div></section>;
}

export function DailyReportButton({region,date,disabled}:{region:string;date:string;disabled:boolean}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[text,setText]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(0);
  const area=useRef<HTMLTextAreaElement>(null);
  async function show(){setOpen(true);setBusy(true);setText('');setError('');try{const r=await fetch('/api/report?'+new URLSearchParams({region,date}),{cache:'no-store'});const result=await r.json() as {text:string;pending:number;error?:string};if(!r.ok)throw new Error(result.error||'보고서를 만들지 못했습니다.');setText(result.text);setPending(result.pending);}catch(e){setError(e instanceof Error?e.message:'보고서를 만들지 못했습니다.');}finally{setBusy(false);}}
  async function copy(){try{await navigator.clipboard.writeText(text);toast.success('일일보고를 복사했어요.');}catch{area.current?.focus();area.current?.select();toast.info('보고서 내용을 선택했어요. 복사해서 사용해 주세요.');}}
  function download(){const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${region}_${date}_일일보고.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  return <><button className="secondary-button" disabled={disabled} onClick={()=>void show()}><FileText size={18}/>일일보고 만들기</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="report-dialog"><DialogHeader><DialogTitle>{date} 일일보고</DialogTitle><DialogDescription>일반건물과 구분건물로 나누어 작성합니다. 호수·주소와 비고를 확인한 뒤 복사해 주세요.</DialogDescription></DialogHeader>{busy?<p role="status">저장된 비고로 일일보고를 작성하고 있어요.</p>:error?<p role="alert" className="error-banner">{error}</p>:<>{pending>0&&<p className="review-hint">조사 상태가 ‘미완료’인 일정이 {pending}개 있습니다. 보고서에도 미완료로 표시됩니다.</p>}<textarea ref={area} readOnly aria-label="일일보고 내용" className="report-text" value={text}/><div className="report-actions"><button className="secondary-button" onClick={download}><Download size={17}/>텍스트 다운로드</button><button className="primary-button" onClick={()=>void copy()}><ClipboardCopy size={17}/>일일보고 복사</button></div></>}</DialogContent></Dialog></>;
}
