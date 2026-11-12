import {rotateCanvas,type Rotation} from './drawing-image.ts';
import {photoVersionTag,type Photo} from './types.ts';

export type RotationSource={url:string;tag:string;type:string;animated:boolean};
export class PhotoRotationError extends Error{
 readonly status:number;
 constructor(message:string,status:number){super(message);this.status=status;}
}

export function photoUrl(photo:Photo){
 return '/api/photos/'+encodeURIComponent(photo.id)+(photo.version?'?v='+encodeURIComponent(photo.version):'');
}

export function canRotatePhoto(photo:Photo){
 return photo.kind==='photo'&&['image/jpeg','image/png','image/webp','image/heic'].includes(photo.content_type);
}

async function animatedPhoto(blob:Blob){
 if(blob.type==='image/webp'){
  const header=new Uint8Array(await blob.slice(0,21).arrayBuffer());
  return new TextDecoder().decode(header.subarray(12,16))==='VP8X'&&Boolean(header[20]&2);
 }
 if(blob.type!=='image/png')return false;
 const data=new DataView(await blob.arrayBuffer());
 for(let offset=8;offset+12<=data.byteLength;){
  const chunk=data.getUint32(offset+4);
  if(chunk===0x6163544c)return true; // acTL
  if(chunk===0x49444154)return false; // IDAT
  offset+=12+data.getUint32(offset);
 }
 return false;
}

export async function loadRotationSource(url:string,signal?:AbortSignal,expectedTag?:string):Promise<RotationSource>{
 const response=await fetch(url,{cache:'no-cache',signal});
 const tag=response.headers.get('etag');
 if(!response.ok||!tag){
  const data=await response.json().catch(()=>null) as {error?:string}|null;
  throw new PhotoRotationError(data?.error||'저장된 사진을 불러오지 못했습니다.',response.status);
 }
 if(expectedTag&&tag!==expectedTag){
  await response.body?.cancel().catch(()=>{});
  throw new PhotoRotationError('확인한 이후 사진이 변경됐습니다. 현재 방향을 확인해 주세요.',412);
 }
 const blob=await response.blob(),animated=await animatedPhoto(blob);
 signal?.throwIfAborted();
 return {url:URL.createObjectURL(blob),tag,type:blob.type,animated};
}

async function encodeRotation(image:HTMLImageElement,rotation:Rotation,type:string){
 const maxBytes=20*1024*1024,canvas=rotateCanvas(image,rotation);
 try{
  for(const quality of type==='image/png'?[undefined]:[0.95,0.88,0.8]){
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,quality));
   if(!blob||blob.type!==type)throw new PhotoRotationError('이 브라우저에서 회전한 사진을 저장할 수 없습니다.',415);
   if(blob.size<=maxBytes)return blob;
  }
  throw new PhotoRotationError('회전한 사진이 20MB를 초과합니다.',413);
 }finally{canvas.width=0;canvas.height=0;}
}

export async function savePhotoRotation(url:string,source:RotationSource,image:HTMLImageElement,rotation:Exclude<Rotation,0>){
 const blob=await encodeRotation(image,rotation,source.type==='image/heic'?'image/jpeg':source.type);
 const response=await fetch(url,{method:'PATCH',headers:{'If-Match':source.tag,'Content-Type':blob.type},body:blob});
 const data=await response.json() as {photo?:Photo;error?:string};
 if(!response.ok||!data.photo)throw new PhotoRotationError(data.error||'회전한 사진을 저장하지 못했습니다.',response.status);
 return data.photo;
}

export async function listFolderRotationPhotos(folder:string,view:'date'|'address',signal?:AbortSignal){
 const params=new URLSearchParams({folder,view,kind:'photo',photosOnly:'1',limit:'100'});
 const photos:Photo[]=[];
 do{
  const response=await fetch('/api/library?'+params,{cache:'no-store',signal});
  const data=await response.json() as {photos:Photo[];nextCursor:string|null;error?:string};
  if(!response.ok)throw new PhotoRotationError(data.error||'폴더의 사진을 불러오지 못했습니다.',response.status);
  photos.push(...data.photos);
  if(!data.nextCursor)break;
  params.set('cursor',data.nextCursor);
 }while(true);
 return photos;
}

export async function rotateFolderPhoto(photo:Photo,rotation:90|270){
 if(!canRotatePhoto(photo))throw new PhotoRotationError('회전 저장을 지원하지 않는 형식입니다.',415);
 const url=photoUrl(photo),source=await loadRotationSource(url,undefined,photoVersionTag(photo.id,photo.version));
 try{
  if(source.animated)throw new PhotoRotationError('움직이는 사진은 회전 저장을 지원하지 않습니다.',415);
  const image=new Image();
  image.src=source.url;
  await image.decode().catch(()=>{throw new PhotoRotationError('이 브라우저에서 사진을 열 수 없습니다.',415);});
  return await savePhotoRotation(url,source,image,rotation);
 }finally{URL.revokeObjectURL(source.url);}
}
