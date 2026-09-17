import {ApiError,failure,identity,storage} from '@/lib/storage';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const owner=await identity();const {db,bucket}=storage();const {id}=await params;
  const row=await db.prepare('SELECT object_key,content_type,filename FROM photos WHERE id=? AND owner=? AND deleted=0').bind(id,owner).first<{object_key:string;content_type:string;filename:string}>();
  if(!row) throw new ApiError('사진을 찾을 수 없습니다.',404);
  const download=new URL(request.url).searchParams.has('download');
  const etag='"photo-'+id+'"';
  if(!download&&request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Cookie'}});
  const object=await bucket.get(row.object_key); if(!object) throw new ApiError('원본 사진을 불러올 수 없습니다.',404);
  return new Response(object.body,{headers:{'Content-Type':row.content_type,'Content-Length':String(object.size),'Cache-Control':download?'private, no-store':'private, no-cache','ETag':etag,'Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Disposition':`${download?'attachment':'inline'}; filename="photo"; filename*=UTF-8''${encodeURIComponent(row.filename)}`}});
}catch(e){return failure(e);}}
