import {schedule} from '@/lib/schedule';
import {ApiError,failure,identity,storage} from '@/lib/storage';
import {createZipStream,safeFilename,type ZipEntry} from '@/lib/zip';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  const owner=await identity();const {db,bucket}=storage();const folder=new URL(request.url).searchParams.get('folder');
  const folders=folder?schedule.filter(f=>f.id===folder):schedule;
  if(!folders.length) throw new ApiError('폴더를 찾을 수 없습니다.',404);
  const query=folder?db.prepare('SELECT id,folder,filename,object_key,size FROM photos WHERE owner=? AND folder=? AND deleted=0 ORDER BY created_at,id').bind(owner,folder):db.prepare('SELECT id,folder,filename,object_key,size FROM photos WHERE owner=? AND deleted=0 ORDER BY created_at,id').bind(owner);
  const {results}=await query.all<{id:string;folder:string;filename:string;object_key:string;size:number}>();
  const entries:ZipEntry[]=[];
  for(const f of folders){
    const path=`사직4구역/2026-09-17/사직동 ${f.id}/`;
    entries.push({name:path,size:0,open:async()=>new Blob([]).stream()});
    for(const photo of results.filter(p=>p.folder===f.id)){
      entries.push({name:`${path}${photo.id}_${safeFilename(photo.filename)}`,size:photo.size,open:async()=>{
        const object=await bucket.get(photo.object_key);
        if(!object) throw new Error('Missing original: '+photo.id);
        return object.body;
      }});
    }
  }
  const name=`사직4구역_2026-09-17${folder?'_'+folder:'_전체'}.zip`;
  return new Response(createZipStream(entries),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="field-photos.zip"; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}
