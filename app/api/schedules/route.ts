import {attribution} from '@/lib/attribution';
import {identityUser,storage,json,failure,limitedBody,imageType,ApiError,requireSameOrigin} from '@/lib/storage';
import {validateSchedule,validateScheduleEdit} from '@/lib/schedule-input';
import {ensureLegacyFolders,findFolder,folderView,type FolderRow} from '@/lib/folders';
import {safeFilename} from '@/lib/zip';
import {checkSchedulePhotos,schedulePhotoBytes} from '@/lib/schedule-pages';

export async function PATCH(request:Request){
  try{
    const user=await identityUser(request),owner=user.owner;requireSameOrigin(request);const {db}=storage();
    let draft;
    const bytes=await limitedBody(request,64000);
    try{draft=validateScheduleEdit(JSON.parse(new TextDecoder().decode(bytes)));}
    catch{throw new ApiError('지역, 조사 날짜, 번지와 일정 내용을 확인해 주세요.');}
    // One atomic update retains the folder ID, original files and survey records.
    // OR IGNORE handles a concurrent move to the same unique schedule key.
    const saved=await db.prepare(`UPDATE OR IGNORE survey_folders SET
      region=?,survey_date=?,lot=?,unit=?,unit_display=?,time=?,name=?,phones=?,address=?,notes=?,updated_by=?,schedule_updated_by=?,revision=revision+1
      WHERE owner=? AND id=? AND revision=? AND deleting=0 RETURNING *`)
      .bind(draft.region,draft.date,draft.lot,draft.unit,draft.unitDisplay,draft.time,draft.name,JSON.stringify(draft.phones),draft.address,draft.notes,attribution(user),attribution(user),owner,draft.id,draft.revision).first<FolderRow>();
    if(saved)return json({folder:folderView(saved)});
    const latest=await findFolder(db,owner,draft.id);
    if(!latest)throw new ApiError('일정을 찾을 수 없습니다. 삭제 여부를 확인해 주세요.',404);
    if(latest.revision!==draft.revision)return json({code:'conflict',error:'다른 기기에서 수정한 내용이 있습니다. 최신 내용과 비교한 뒤 다시 저장해 주세요.',latest:folderView(latest)},409);
    return json({code:'duplicate',error:'같은 지역·날짜·번지·건물·호수의 일정이 이미 있습니다. 날짜나 건물·호수를 확인해 주세요.'},409);
  }catch(e){return failure(e);}
}

export async function POST(request:Request){
  try{
    const user=await identityUser(request),owner=user.owner,stamp=attribution(user);const {db,bucket}=storage();
    const manual=request.headers.get('content-type')?.split(';')[0].trim()==='application/json';
    const bytes=await limitedBody(request,manual?1024*1024:schedulePhotoBytes+2*1024*1024);
    let input:unknown;
    const files:File[]=[];
    if(manual){
      try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError('일정 내용을 확인해 주세요.');}
    }else{
      let form:FormData;try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}catch{throw new ApiError('일정표 사진과 내용을 함께 등록해 주세요.');}
      try{input=JSON.parse(String(form.get('schedule')));}catch{throw new ApiError('일정 내용을 확인해 주세요.');}
      for(const photo of form.getAll('photo')){
        if(typeof photo==='string')throw new ApiError('일정표 사진을 선택해 주세요.');
        files.push(photo);
      }
      try{checkSchedulePhotos(files);}catch(e){throw new ApiError((e as Error).message);}
    }
    let draft;try{draft=validateSchedule(input);}catch{throw new ApiError('지역, 조사 날짜, 번지와 일정 내용을 확인해 주세요.');}
    const sources=await Promise.all(files.map(async file=>{
      const id=crypto.randomUUID(),type=imageType(new Uint8Array(await file.slice(0,32).arrayBuffer()));
      return {id,key:`${owner}/schedules/${id}`,type,file};
    }));
    await ensureLegacyFolders(db,owner);
    const createdAt=new Date().toISOString();
    const unique=draft.folders;
    const teamSchedule=!manual&&new Set(unique.map(folder=>folder.group)).size>1;
    let added=0;
    try{
      for(const {key,type,file} of sources)await bucket.put(key,new Uint8Array(await file.arrayBuffer()),{httpMetadata:{contentType:type}});
      const statements=unique.map((f,index)=>db.prepare('INSERT INTO survey_folders (owner,id,region,survey_date,lot,unit,time,name,phones,address,notes,group_index,sort_index,warning,manual_added,unit_display,created_by,schedule_team) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,region,survey_date,lot,unit) DO NOTHING RETURNING id').bind(owner,crypto.randomUUID(),draft.region,draft.date,f.lot,f.unit,f.time,f.name,JSON.stringify(f.phones),f.address,f.notes,f.group,index,0,manual?1:0,manual?String((input as {folders:{unit?:string}[]}).folders[index]?.unit||'').normalize('NFC').trim().replace(/\s+/g,' '):f.unit,stamp,teamSchedule?f.group:null));
      if(teamSchedule){
        const rows=JSON.stringify(unique.map(({lot,unit,group},index)=>({lot,unit,group,index})));
        statements.push(db.prepare(`UPDATE survey_folders AS f SET schedule_team=json_extract(row.value,'$.group'),
          group_index=json_extract(row.value,'$.group'),sort_index=json_extract(row.value,'$.index')
          FROM json_each(?) row WHERE f.owner=? AND f.region=? AND f.survey_date=? AND f.deleting=0 AND f.manual_added=0
          AND f.lot=json_extract(row.value,'$.lot') AND f.unit=json_extract(row.value,'$.unit')`).bind(rows,owner,draft.region,draft.date));
      }
      if(sources.length){
        const serialized=JSON.stringify(draft);
        for(const {id,key,type,file} of sources)statements.push(db.prepare('INSERT INTO schedule_imports (id,owner,filename,object_key,content_type,size,draft,region,survey_date,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,safeFilename(file.name),key,type,file.size,serialized,draft.region,draft.date,createdAt,stamp));
      }
      const results=await db.batch(statements);
      // D1 changes includes activity-trigger writes; only inserted schedule rows count.
      added=results.slice(0,unique.length).reduce((n,r)=>n+r.results.length,0);
    }catch(e){await Promise.all(sources.map(source=>bucket.delete(source.key)));throw e;}
    return json({region:draft.region,date:draft.date,added,existing:unique.length-added},201);
  }catch(e){return failure(e);}
}
