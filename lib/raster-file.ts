export async function rasterFile(file:File){
 if(!file.size||file.size>20*1024*1024)throw Error('일정표는 한 장당 20MB 이하의 JPG, PNG, WEBP 사진을 선택해 주세요.');
 const bytes=new Uint8Array(await file.slice(0,32).arrayBuffer());
 const text=new TextDecoder().decode(bytes);
 const type=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg'
  :[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)?'image/png'
  :text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'?'image/webp':null;
 if(!type)throw Error('일정표는 JPG, PNG, WEBP 사진만 사용할 수 있습니다.');
 // Keep bytes unchanged, but never carry an active document MIME into a preview.
 return new File([file],file.name,{type,lastModified:file.lastModified});
}
