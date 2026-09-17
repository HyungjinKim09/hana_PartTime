type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>Promise<unknown>};
export function registerPhotoTools(){
  const context=(document as Document & {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  try{Promise.resolve(context.registerTool({name:'list_field_photo_folders',title:'현장 사진 폴더 조회',description:'현재 로그인한 사용자의 조사 폴더와 사진 개수를 조회합니다. folder를 지정하면 그 폴더의 저장된 사진 목록도 반환합니다. 읽기 전용이며 다운로드나 삭제를 실행하지 않습니다.',inputSchema:{type:'object',properties:{folder:{type:'string'}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},async execute(input){
    if(input===null || typeof input!=='object' || Array.isArray(input))throw new Error('객체를 입력해 주세요.');
    const args=input as Record<string,unknown>;if(Object.keys(args).some(k=>k!=='folder') || (args.folder!==undefined&&typeof args.folder!=='string'))throw new Error('folder는 문자열이어야 합니다.');
    const response=await fetch('/api/library'+(args.folder?'?folder='+encodeURIComponent(String(args.folder)):''),{cache:'no-store'});
    const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'조회 실패');return data;
  }},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return()=>lifecycle.abort();
}
