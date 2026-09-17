import {identity,storage,json,failure,limitedBody,imageType,ApiError} from '@/lib/storage';
import {validateSchedule} from '@/lib/schedule-input';
import {ensureLegacyFolders} from '@/lib/folders';
import {safeFilename} from '@/lib/zip';

export async function POST(request:Request){
  try{
    const owner=await identity(request);const {db,bucket}=storage();
    const manual=request.headers.get('content-type')?.split(';')[0].trim()==='application/json';
    const bytes=await limitedBody(request,manual?1024*1024:22*1024*1024);
    let input:unknown,file:File|null=null;
    if(manual){
      try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError('일정 내용을 확인해 주세요.');}
    }else{
      let form:FormData;try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}catch{throw new ApiError('일정표 사진과 내용을 함께 등록해 주세요.');}
      try{input=JSON.parse(String(form.get('schedule')));}catch{throw new ApiError('일정 내용을 확인해 주세요.');}
      const photo=form.get('photo');if(!photo||typeof photo==='string')throw new ApiError('일정표 사진을 선택해 주세요.');file=photo;
      if(file.size>20*1024*1024||file.size===0)throw new ApiError('사진 한 장은 20MB 이하여야 합니다.');
    }
    let draft;try{draft=validateSchedule(input);}catch{throw new ApiError('지역, 조사 날짜, 번지와 일정 내용을 확인해 주세요.');}
    const original=file?new Uint8Array(await file.arrayBuffer()):null,type=original?imageType(original):null;
    await ensureLegacyFolders(db,owner);
    const id=crypto.randomUUID(),key=`${owner}/schedules/${id}`,createdAt=new Date().toISOString();
    const unique=draft.folders;
    if(original&&type)await bucket.put(key,original,{httpMetadata:{contentType:type}});
    let added=0;
    try{
      const statements=unique.map((f,index)=>db.prepare('INSERT INTO survey_folders (owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index,warning) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,region,survey_date,lot,unit) DO NOTHING').bind(owner,crypto.randomUUID(),draft.region,draft.date,f.lot,f.unit,f.time,f.name,JSON.stringify(f.phones),f.address,f.notes,f.group,index,0));
      if(file)statements.push(db.prepare('INSERT INTO schedule_imports (id,owner,filename,object_key,content_type,size,draft,region,survey_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,owner,safeFilename(file.name),key,type,file.size,JSON.stringify(draft),draft.region,draft.date,createdAt));
      const results=await db.batch(statements);
      added=results.slice(0,unique.length).reduce((n,r)=>n+r.meta.changes,0);
    }catch(e){if(original)await bucket.delete(key);throw e;}
    return json({region:draft.region,date:draft.date,added,existing:unique.length-added},201);
  }catch(e){return failure(e);}
}
