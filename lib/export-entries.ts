export type ExportManifest={name:string;totalBytes:number;files:number;entries:{name:string;size:number;url:string|null}[]};
const MAX_PREFETCH=3,MAX_BUFFER_BYTES=32*1024*1024;
type Outcome={bytes:Uint8Array;error?:never}|{error:unknown;bytes?:never};
export function exportEntries(manifest:ExportManifest,request:typeof fetch,signal?:AbortSignal,onProgress?:(bytes:number)=>void){
  const controller=new AbortController();
  const abort=()=>controller.abort(signal?.reason);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  let downloaded=0,next=0,reserved=0;
  const jobs=new Map<number,Promise<Outcome>>();
  function dispose(){controller.abort();signal?.removeEventListener('abort',abort);jobs.clear();}
  async function response(index:number){
    controller.signal.throwIfAborted();
    const result=await request(manifest.entries[index].url!,{signal:controller.signal,credentials:'same-origin',cache:'no-store'});
    if(!result.ok){const data=await result.json().catch(()=>null) as {error?:string}|null;throw Error(data?.error||`원본을 받지 못했습니다 (${result.status}). ZIP 다운로드를 다시 시도해 주세요.`);}
    if(!result.body)throw Error('원본 파일이 비어 있습니다.');
    return result.body;
  }
  async function buffer(index:number){
    const reader=(await response(index)).getReader(),size=manifest.entries[index].size,bytes=new Uint8Array(size);let offset=0,complete=false;
    try{
      for(;;){controller.signal.throwIfAborted();const {done,value}=await reader.read();if(done){complete=true;break;}
        if(offset+value.byteLength>size)throw Error('Original size mismatch');
        bytes.set(value,offset);offset+=value.byteLength;downloaded+=value.byteLength;onProgress?.(downloaded);
      }
      if(offset!==size)throw Error('Original size mismatch');return bytes;
    }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  function fill(){
    controller.signal.throwIfAborted();
    while(next<manifest.entries.length&&jobs.size<MAX_PREFETCH){
      const index=next,entry=manifest.entries[index];
      if(entry.url===null){next++;continue;}
      if(!Number.isSafeInteger(entry.size)||entry.size<0)throw Error('Invalid original size');
      if(reserved+entry.size>MAX_BUFFER_BYTES)break;
      next++;reserved+=entry.size;
      // Settle out-of-order failures so rejected background jobs cannot go unhandled.
      jobs.set(index,buffer(index).then(bytes=>({bytes}),error=>{controller.abort(error);return {error};}));
    }
  }
  const entries=manifest.entries.map((entry,index)=>({name:entry.name,size:entry.size,open:async()=>{
    controller.signal.throwIfAborted();
    // ZIP has consumed earlier entries. Release their buffers before refilling slots.
    for(const previous of jobs.keys())if(previous<index){reserved-=manifest.entries[previous].size;jobs.delete(previous);}
    if(entry.url===null)return new Blob([]).stream();
    fill();
    if(entry.size>MAX_BUFFER_BYTES){
      // Legacy large originals stream alone instead of exceeding the memory budget.
      next=index+1;
      return (await response(index)).pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,out){controller.signal.throwIfAborted();downloaded+=chunk.byteLength;onProgress?.(downloaded);out.enqueue(chunk);}}));
    }
    const job=jobs.get(index);if(!job)throw Error('Download order mismatch');
    const result=await job;controller.signal.throwIfAborted();if('error' in result)throw result.error;
    const bytes=result.bytes!;let offset=0;
    return new ReadableStream<Uint8Array>({pull(out){controller.signal.throwIfAborted();if(offset===bytes.length){out.close();return;}const end=Math.min(offset+65536,bytes.length);out.enqueue(bytes.subarray(offset,end));offset=end;}});
  }}));
  return Object.assign(entries,{dispose});
}
