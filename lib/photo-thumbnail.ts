import {photoVersionTag,type Photo} from './types.ts';
export const THUMBNAIL_BYTES=64*1024;
export function thumbnailUrl(photo:Photo){return '/api/photos/'+encodeURIComponent(photo.id)+'?preview=1'+(photo.version?'&v='+encodeURIComponent(photo.version):'');}
export async function thumbnailFromImage(image:CanvasImageSource,width:number,height:number):Promise<Blob|null>{
 if(!width||!height)return null;
 const scale=Math.min(1,480/Math.max(width,height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 try{
  const context=canvas.getContext('2d');if(!context)return null;
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.75,.55,.35]){
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob?.type==='image/jpeg'&&blob.size<=THUMBNAIL_BYTES)return blob;
  }
  return null;
 }finally{canvas.width=0;canvas.height=0;}
}
export async function storePhotoThumbnail(photo:Photo,blob:Blob,request:typeof fetch=fetch,signal?:AbortSignal){
 const response=await request('/api/photos/'+encodeURIComponent(photo.id),{method:'PUT',headers:{'Content-Type':'image/jpeg','If-Match':photoVersionTag(photo.id,photo.version)},body:blob,signal});
 return response.ok;
}
