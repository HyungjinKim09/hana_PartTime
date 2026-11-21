// A completed server save must survive a failed local-draft cleanup attempt.
export function createScheduleSubmission<T extends object>(){
 let saved:T|undefined,inFlight:Promise<T>|undefined;
 return {
  hasSubmitted:()=>saved!==undefined,
  finish(submit:()=>Promise<T>,cleanup:()=>Promise<unknown>,onSubmitted?:(result:T)=>void):Promise<T>{
   if(inFlight)return inFlight;
   const attempt=async()=>{
    if(saved===undefined){saved=await submit();onSubmitted?.(saved);}
    await cleanup();
    return saved;
   };
   inFlight=attempt().finally(()=>{inFlight=undefined;});
   return inFlight;
  },
 };
}
