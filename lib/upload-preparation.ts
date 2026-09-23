// Persist all selected originals in small transactions, independently of network speed.
// A file's gate opens only once its transaction finishes (or explicitly fails).
export function prepareUploadBatches(files:File[],save:(files:File[])=>Promise<unknown>){
  const release:((error:Error|null)=>void)[]=[];
  const ready=files.map(()=>new Promise<Error|null>(resolve=>release.push(resolve)));
  const done=(async()=>{
    for(let start=0;start<files.length;start+=3){
      const batch=files.slice(start,start+3);let problem:Error|null=null;
      try{await save(batch);}catch(error){problem=error instanceof Error?error:Error('기기 임시 보관에 실패했습니다.');}
      for(let i=start;i<start+batch.length;i++)release[i](problem);
    }
  })();
  return {ready,done};
}
