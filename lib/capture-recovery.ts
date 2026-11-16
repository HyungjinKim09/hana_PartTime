export async function retryCaptureStorage<T extends {file:File;localSaved:boolean}>(shots:T[],save:(file:File)=>Promise<unknown>){
  let error:Error|undefined;
  const updated:T[]=[];
  for(const shot of shots){
    if(shot.localSaved){updated.push(shot);continue;}
    try{await save(shot.file);updated.push({...shot,localSaved:true});}
    catch(e){updated.push(shot);error??=e instanceof Error?e:Error('기기 임시 저장에 실패했습니다.');}
  }
  return {shots:updated,error};
}
