import {listFolders} from '@/lib/folders';
import {exportFolderLabel} from '@/lib/daily-report';
import {ApiError,failure,identity,storage} from '@/lib/storage';
import {createZipStream,safeFilename,type ZipEntry} from '@/lib/zip';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  const owner=await identity();const {db,bucket}=storage();const params=new URL(request.url).searchParams;
  const folder=params.get('folder'),region=params.get('region'),date=params.get('date');
  const allFolders=await listFolders(db,owner);
  const folderNames=new Map<string,string>();const used=new Set<string>();
  // Resolve names before filtering so single-folder and full downloads agree.
  for(const f of [...allFolders].sort((a,b)=>a.id.localeCompare(b.id))){
    const base=safeFilename(exportFolderLabel(f));let name=base;let index=1;
    const key=(value:string)=>`${f.date}/${value}`.toLowerCase();
    while(used.has(key(name))){const suffix=` (${++index})`;name=base.slice(0,120-suffix.length)+suffix;}
    used.add(key(name));folderNames.set(f.id,name);
  }
  const folders=allFolders.filter(f=>(!folder||f.id===folder)&&(!region||f.region===region)&&(!date||f.date===date));
  if(!folders.length)throw new ApiError('폴더를 찾을 수 없습니다.',404);
  const {results}=await db.prepare('SELECT id,folder,filename,object_key,size FROM photos WHERE owner=? AND deleted=0 ORDER BY created_at,id').bind(owner).all<{id:string;folder:string;filename:string;object_key:string;size:number}>();
  const entries:ZipEntry[]=[];
  const downloadKeys:string[]=[];
  let download:(key:string)=>Promise<R2ObjectBody|null>;
  const addOriginal=(name:string,key:string,size:number)=>{
    downloadKeys.push(key);
    entries.push({name,size,open:async()=>{const object=await download(key);if(!object)throw new Error('Missing original: '+key);return object.body;}});
  };
  for(const f of folders){const path=`${f.date}/${folderNames.get(f.id)}/`;
    entries.push({name:path,size:0,open:async()=>new Blob([]).stream()});
    for(const p of results.filter(p=>p.folder===f.id))addOriginal(`${path}${p.id}_${safeFilename(p.filename)}`,p.object_key,p.size);
  }
  if(!folder){
    const sources=await db.prepare('SELECT id,filename,object_key,size,region,survey_date FROM schedule_imports WHERE owner=? AND region IS NOT NULL AND survey_date IS NOT NULL').bind(owner).all<{id:string;filename:string;object_key:string;size:number;region:string;survey_date:string}>();
    for(const source of sources.results.filter(s=>folders.some(f=>f.region===s.region&&f.date===s.survey_date)))addOriginal(`${source.survey_date}/일정표_${source.id}_${safeFilename(source.filename)}`,source.object_key,source.size);
  }
  download=await bucket.reserveDownloads(downloadKeys);
  const name=safeFilename([region||'현장사진',date,folder?folderNames.get(folders[0].id):'전체'].filter(Boolean).join('_'))+'.zip';
  return new Response(createZipStream(entries),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="field-photos.zip"; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}
