export const ARCHIVE_PART_BYTES=200*1024*1024;
export function archiveParts<T extends {name:string;size:number}>(entries:T[],limit=ARCHIVE_PART_BYTES):T[][]{
 if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid archive part limit');
 const parts:T[][]=[[]];let bytes=0;
 for(const entry of entries){if(entry.size<0||!Number.isSafeInteger(entry.size)||entry.size>limit)throw Error('Original exceeds archive part limit');if(bytes+entry.size>limit){parts.push([]);bytes=0;}parts.at(-1)!.push(entry);bytes+=entry.size;}
 return parts;
}
