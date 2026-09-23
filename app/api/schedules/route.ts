import {identity,storage,json,failure,limitedBody,imageType,ApiError,requireSameOrigin} from '@/lib/storage';
import {validateSchedule,validateScheduleEdit} from '@/lib/schedule-input';
import {ensureLegacyFolders,findFolder,folderView,type FolderRow} from '@/lib/folders';
import {safeFilename} from '@/lib/zip';

export async function PATCH(request:Request){
  try{
    const owner=await identity(request);requireSameOrigin(request);const {db}=storage();
    let draft;
    const bytes=await limitedBody(request,64000);
    try{draft=validateScheduleEdit(JSON.parse(new TextDecoder().decode(bytes)));}
    catch{throw new ApiError('지역, 조사 날짜, 번지와 일정 내용을 확인해 주세요.');}
    // One atomic update retains the folder ID, original files and survey records.
    // OR IGNORE handles a concurrent move to the same unique schedule key.
    const saved=await db.prepare(`UPDATE OR IGNORE survey_folders SET
      region=?,survey_date=?,lot=?,unit=?,unit_display=?,time=?,name=?,phones=?,address=?,notes=?,revision=revision+1
      WHERE owner=? AND id=? AND revision=? AND deleting=0 RETURNING *`)
      .bind(draft.region,draft.date,draft.lot,draft.unit,draft.unitDisplay,draft.time,draft.name,JSON.stringify(draft.phones),draft.address,draft.notes,owner,draft.id,draft.revision).first<FolderRow>();
    if(saved)return json({folder:folderView(saved)});
    const latest=await findFolder(db,owner,draft.id);
    if(!latest)throw new ApiError('일정을 찾을 수 없습니다. 삭제 여부를 확인해 주세요.',404);
    if(latest.revision!==draft.revision)return json({code:'conflict',error:'다른 기기에서 수정한 내용이 있습니다. 최신 내용과 비교한 뒤 다시 저장해 주세요.',latest:folderView(latest)},409);
    return json({code:'duplicate',error:'같은 지역·날짜·번지·건물·호수의 일정이 이미 있습니다. 날짜나 건물·호수를 확인해 주세요.'},409);
  }catch(e){return failure(e);}
}

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
      const statements=unique.map((f,index)=>db.prepare('INSERT INTO survey_folders (owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index,warning,manual_added,unit_display) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,region,survey_date,lot,unit) DO NOTHING').bind(owner,crypto.randomUUID(),draft.region,draft.date,f.lot,f.unit,f.time,f.name,JSON.stringify(f.phones),f.address,f.notes,f.group,index,0,manual?1:0,manual?String((input as {folders:{unit?:string}[]}).folders[index]?.unit||'').normalize('NFC').trim().replace(/\s+/g,' '):f.unit));
      if(file)statements.push(db.prepare('INSERT INTO schedule_imports (id,owner,filename,object_key,content_type,size,draft,region,survey_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,owner,safeFilename(file.name),key,type,file.size,JSON.stringify(draft),draft.region,draft.date,createdAt));
      const results=await db.batch(statements);
      added=results.slice(0,unique.length).reduce((n,r)=>n+r.meta.changes,0);
    }catch(e){if(original)await bucket.delete(key);throw e;}
    return json({region:draft.region,date:draft.date,added,existing:unique.length-added},201);
  }catch(e){return failure(e);}
}
