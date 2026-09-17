// Create previews on the uploading device; never recompress the stored original.
export async function createThumbnail(file:Blob):Promise<Blob|null>{
  let bitmap:ImageBitmap|undefined;
  try{
    bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    const scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');if(!context)return null;
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.75,.55,.35]){const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=64*1024)return blob;}
    return null;
  }catch{return null;}finally{bitmap?.close();}
}
