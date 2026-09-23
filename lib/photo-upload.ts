import type {Photo} from './types';
import {uploadId} from './upload-id.ts';
export const UPLOAD_CONCURRENCY=3;
type UploadOptions={
  request?:typeof fetch;
  signal?:AbortSignal;
  timeoutMs?:number;
  beforeUpload?:(file:File,index:number)=>Promise<unknown>;
  onStart?:(file:File,index:number)=>void;
  onSaved?:(file:File,photo:Photo,index:number,elapsedMs:number)=>void|Promise<void>;
  onProgress?:(completed:number,total:number)=>void;
  onError?:(file:File,error:Error,index:number)=>void;
};

// Keep only a few original bodies in flight; refill a slot as soon as it finishes.
export async function uploadPhotos(files:File[],folder:string,kind:'photo'|'drawing',options:UploadOptions={}){
  const request=options.request||fetch;
  const failed=new Set<number>();
  let next=0,completed=0,saved=0;
  async function worker(){
    while(next<files.length){
      const index=next++,file=files[index],started=performance.now();
      let photo:Photo|undefined,problem:Error|undefined;
      const controller=new AbortController();
      const abort=()=>controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort',abort,{once:true});
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{
        if(options.signal?.aborted)abort();controller.signal.throwIfAborted();
        if(file.size>20*1024*1024)throw Error('한 장당 20MB까지 올릴 수 있어요.');
        if(options.beforeUpload)await options.beforeUpload(file,index);
        controller.signal.throwIfAborted();
        timer=setTimeout(()=>controller.abort(new DOMException('전송 시간이 초과됐습니다. 같은 사진으로 다시 시도해 주세요.','TimeoutError')),options.timeoutMs??180000);
        options.onStart?.(file,index);
        const response=await request(`/api/library?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(file.name)}&kind=${kind}`,{
          method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-Upload-Id':uploadId(file)},body:file,signal:controller.signal,
        });
        const data=await response.json() as {error?:string;photo?:Photo};
        if(!response.ok)throw Error(data.error||'업로드 실패');
        if(!data.photo?.id)throw Error('저장 결과를 확인하지 못했습니다.');
        photo=data.photo;
      }catch(error){
        problem=error instanceof Error?error:Error('업로드 실패');
      }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
      if(photo)saved++;else failed.add(index);
      // A rendering callback must not turn a confirmed save into a retry.
      try{
        if(photo)await options.onSaved?.(file,photo,index,performance.now()-started);
        else options.onError?.(file,problem!,index);
      }catch(error){console.error('Upload display update failed',error);}
      options.onProgress?.(++completed,files.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(UPLOAD_CONCURRENCY,files.length)},()=>worker()));
  return {saved,failed:files.filter((_,index)=>failed.has(index))};
}
