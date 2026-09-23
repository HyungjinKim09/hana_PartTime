import {createZipStream,safeFilename} from './zip';
import {exportEntries,type ExportManifest} from './export-entries';
type SaveWindow=Window&{showSaveFilePicker?:(options:unknown)=>Promise<{createWritable:()=>Promise<WritableStream<Uint8Array>>}>};
export async function downloadArchive(query:URLSearchParams,signal:AbortSignal,onProgress:(bytes:number,total:number)=>void,suggestedName='현장사진_전체'){
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
    return 'saved' as const;
  }
  // Mobile/Firefox fallback: only publish a link after the complete ZIP validates.
  const blob=await new Response(stream,{headers:{'Content-Type':'application/zip'}}).blob();
  signal.throwIfAborted();
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=data.name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  return 'download' as const;
}
