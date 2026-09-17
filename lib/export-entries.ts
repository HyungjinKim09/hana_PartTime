export type ExportManifest={name:string;totalBytes:number;files:number;entries:{name:string;size:number;url:string|null}[]};
export function exportEntries(manifest:ExportManifest,request:typeof fetch,signal?:AbortSignal,onProgress?:(bytes:number)=>void){
  let downloaded=0;
  return manifest.entries.map(entry=>({name:entry.name,size:entry.size,open:async()=>{
    signal?.throwIfAborted();
    if(entry.url===null)return new Blob([]).stream();
    const response=await request(entry.url,{signal,credentials:'same-origin',cache:'no-store'});
    if(!response.ok){
      const data=await response.json().catch(()=>null) as {error?:string}|null;
      throw new Error(data?.error||`원본을 받지 못했습니다 (${response.status}). ZIP 다운로드를 다시 시도해 주세요.`);
    }
    if(!response.body)throw new Error('원본 파일이 비어 있습니다.');
    return response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){
      signal?.throwIfAborted();downloaded+=chunk.byteLength;onProgress?.(downloaded);controller.enqueue(chunk);
    }}));
  }}));
}
