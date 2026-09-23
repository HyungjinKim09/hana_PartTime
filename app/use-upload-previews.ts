"use client";
import {useEffect,useRef,useState} from 'react';
import type {Photo} from '@/lib/types';

type UploadPreview={key:string;folder:string;kind:Photo['kind'];file:File;url:string;status:'queued'|'uploading'|'failed'|'saved';photo?:Photo;elapsedMs?:number;error?:string};

export function useUploadPreviews(scope:string){
  const [items,setItems]=useState<UploadPreview[]>([]);
  const current=useRef<UploadPreview[]>([]);
  function update(next:UploadPreview[]){current.current=next;setItems(next);}
  function release(){for(const item of current.current)if(item.url)URL.revokeObjectURL(item.url);current.current=[];}
  // Blob URLs are external resources owned by this navigation scope.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{release();setItems([]);return release;},[scope]);
  function begin(files:File[],folder:string,kind:Photo['kind']){
    const added=files.map(file=>{
      const retry=current.current.find(item=>item.file===file&&item.status==='failed');
      // Object URLs point at the selected original; no encoding or upload copy.
      return {...(retry||{key:crypto.randomUUID(),folder,kind,file,url:file.size<=20*1024*1024?URL.createObjectURL(file):''}),status:'queued' as const,error:undefined};
    });
    const keys=new Set(added.map(item=>item.key));
    update([...added,...current.current.filter(item=>!keys.has(item.key))]);
    return added;
  }
  function patch(key:string,change:Partial<UploadPreview>){update(current.current.map(item=>item.key===key?{...item,...change}:item));}
  function remove(predicate:(item:UploadPreview)=>boolean){
    update(current.current.filter(item=>{if(!predicate(item))return true;if(item.url)URL.revokeObjectURL(item.url);return false;}));
  }
  return {items,begin,patch,remove};
}
