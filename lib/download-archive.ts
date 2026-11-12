import {createZipStream,safeFilename} from './zip.ts';
import {exportEntries,type ExportManifest} from './export-entries.ts';
type SaveWindow=Window&{showSaveFilePicker?:(options:unknown)=>Promise<{createWritable:()=>Promise<WritableStream<Uint8Array>>}>};
export async function downloadArchive(query:URLSearchParams,signal:AbortSignal,onProgress:(bytes:number,total:number)=>void,suggestedName='현장사진_전체',previousReceipts:readonly string[]=[]){
  const picker=(window as SaveWindow).showSaveFilePicker;
  // The picker must be invoked directly from the user's click, before network awaits.
  const handle=picker?await picker.call(window,{suggestedName:safeFilename(suggestedName)+'.zip',types:[{description:'ZIP 파일',accept:{'application/zip':['.zip']}}]}):null;
  signal.throwIfAborted();
  const params=new URLSearchParams(query);
  if(!handle)params.set('maxBytes',String(256*1024*1024));
  const response=await fetch('/api/export?'+params,{method:'POST',signal,cache:'no-store'});
  const data=await response.json() as ExportManifest&{error?:string};
  if(!response.ok)throw new Error(data.error||'다운로드를 준비하지 못했습니다.');
  onProgress(0,data.totalBytes);
  const stream=createZipStream(exportEntries(data,fetch,signal,bytes=>onProgress(bytes,data.totalBytes)));
  if(handle){
    // pipeTo aborts the temporary file on any missing/truncated original or cancellation.
    await stream.pipeTo(await handle.createWritable(),{signal});
  }else{
    // Browsers without a save picker can only report the handoff of a complete ZIP.
    const blob=await new Response(stream,{headers:{'Content-Type':'application/zip'}}).blob();
    signal.throwIfAborted();
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=data.name;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  const receipts=data.downloadReceipts||(data.downloadReceipt?[data.downloadReceipt]:[]);
  const coverage=[...new Set([...previousReceipts,...receipts])];
  let ids:string[]=[];
  let statusError='';
  if(coverage.length){
    try{
      const recorded=await fetch('/api/export?completed=1',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipts:coverage}),
        keepalive:true,signal:AbortSignal.timeout(15000),
      });
      const status=await recorded.json() as {ids:string[];error?:string};
      if(!recorded.ok)throw Error(status.error||'다운로드 완료 상태를 저장하지 못했습니다.');
      ids=status.ids;
    }catch(error){
      statusError=handle?'ZIP을 저장했지만 완료 상태를 기록하지 못했습니다.':'ZIP을 브라우저에 전달했지만 완료 상태를 기록하지 못했습니다.';
      if(error instanceof Error&&error.message)statusError+=' '+error.message;
    }
  }
  return {result:handle?'saved' as const:'download' as const,receipts,ids,statusError};
}
