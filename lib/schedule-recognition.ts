import type {ScheduleDraft} from './types';

export async function recognizeSchedulePhoto(file:File,onProgress:(n:number)=>void,options:{signal?:AbortSignal;timeoutMs?:number}={}):Promise<ScheduleDraft>{
 const controller=new AbortController(),signal=controller.signal;
 const abort=()=>controller.abort(options.signal?.reason);
 options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
 const expired=()=>controller.abort(new DOMException('인식 시간이 초과됐습니다. 연결을 확인하고 다시 인식해 주세요.','TimeoutError'));
 let timer=setTimeout(expired,options.timeoutMs??15000);
 const bounded=new Promise<never>((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 async function recognize(){
 signal.throwIfAborted();
 const status=await fetch('/api/schedules/recognize',{cache:'no-store',signal});
 const info=await status.json() as {available?:boolean;remaining?:number;error?:string};
 signal.throwIfAborted();
 clearTimeout(timer);timer=setTimeout(expired,options.timeoutMs??(info.available?75000:300000));
 if(!status.ok)throw Error(info.error||'일정표 인식 연결을 확인하지 못했습니다.');
 if(!info.available){
  const {recognizeSchedule}=await import('./schedule-ocr');
  const draft=await recognizeSchedule(file,onProgress,signal);
  draft.warnings.unshift('CLOVA가 아직 연결되지 않아 기존 기기 내 OCR로 읽었습니다.');return draft;
 }
 if(!info.remaining)throw Error('이번 달 자동 인식 한도에 도달했습니다. 원본을 보며 직접 입력해 주세요.');
 onProgress(10);
 let photo:Blob=file;
 if(file.type==='image/webp'){
  const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw Error('사진을 변환하지 못했습니다.');}
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0);bitmap.close();
  photo=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('사진을 변환하지 못했습니다.')),'image/jpeg',.95));
 }
 onProgress(25);
 signal.throwIfAborted();
 const response=await fetch('/api/schedules/recognize',{method:'POST',headers:{'Content-Type':photo.type},body:photo,signal});
 const result=await response.json() as {draft?:ScheduleDraft;error?:string;remaining:number;limit:number};
 if(!response.ok||!result.draft)throw Error(result.error||'일정표를 읽지 못했습니다. 직접 입력할 수 있습니다.');
 onProgress(100);result.draft.warnings.unshift(`이번 달 사이트 자동 인식 잔여 ${result.remaining}회 / ${result.limit}회`);
 return result.draft;
 }
 try{return await Promise.race([recognize(),bounded]);}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
