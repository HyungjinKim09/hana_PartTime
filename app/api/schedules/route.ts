import {identity,storage,json,failure,limitedBody,imageType,ApiError} from '@/lib/storage';
import {validateSchedule} from '@/lib/schedule-input';
import {ensureLegacyFolders} from '@/lib/folders';
import {safeFilename} from '@/lib/zip';

export async function POST(request:Request){
  try{
    const owner=await identity(request);const {db,bucket}=storage();
    const bytes=await limitedBody(request,22*1024*1024);
    let form:FormData;try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}catch{throw new ApiError('일정표 사진과 내용을 함께 등록해 주세요.');}
    let draft;try{draft=validateSchedule(JSON.parse(String(form.get('schedule'))));}catch{throw new ApiError('지역, 조사 날짜, 번지와 일정 내용을 확인해 주세요.');}
    const file=form.get('photo');if(!file||typeof file==='string')throw new ApiError('일정표 사진을 선택해 주세요.');
    if(file.size>20*1024*1024||file.size===0)throw new ApiError('사진 한 장은 20MB 이하여야 합니다.');
    const original=new Uint8Array(await file.arrayBuffer()),type=imageType(original);
    await ensureLegacyFolders(db,owner);
    const id=crypto.randomUUID(),key=`${owner}/schedules/${id}`,createdAt=new Date().toISOString();
    const unique=[...new Map(draft.folders.map(f=>[f.lot,f])).values()];
    await bucket.put(key,original,{httpMetadata:{contentType:type}});
    let added=0;
    try{
      const results=await db.batch([
        ...unique.map((f,index)=>db.prepare('INSERT INTO survey_folders (owner,id,region,survey_date,lot,time,name,phones,address,notes,group_index,sort_index,warning) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,region,survey_date,lot) DO NOTHING').bind(owner,crypto.randomUUID(),draft.region,draft.date,f.lot,f.time,f.name,JSON.stringify(f.phones),f.address,f.notes,f.group,index,0)),
        db.prepare('INSERT INTO schedule_imports (id,owner,filename,object_key,content_type,size,draft,region,survey_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,owner,safeFilename(file.name),key,type,file.size,JSON.stringify(draft),draft.region,draft.date,createdAt),
      ]);
      added=results.slice(0,-1).reduce((n,r)=>n+r.meta.changes,0);
    }catch(e){await bucket.delete(key);throw e;}
    return json({region:draft.region,date:draft.date,added,existing:unique.length-added},201);
  }catch(e){return failure(e);}
}
