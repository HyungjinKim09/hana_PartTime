'use client';
import {useEffect,useRef,useState} from 'react';
import type {Photo} from '@/lib/types';
import {photoUrl} from '@/lib/photo-rotation';
import {THUMBNAIL_BYTES,thumbnailFromImage,thumbnailUrl,storePhotoThumbnail} from '@/lib/photo-thumbnail';

export function GalleryImage({photo,localUrl}:{photo:Photo;localUrl?:string}){
 const attempted=useRef(false),alive=useRef(true),controller=useRef<AbortController|null>(null);
 const [fallback,setFallback]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 async function loaded(image:HTMLImageElement){
  if(attempted.current||photo.kind!=='photo'||photo.thumbnail||photo.size<=THUMBNAIL_BYTES)return;
  attempted.current=true;
  try{
   const blob=await thumbnailFromImage(image,image.naturalWidth,image.naturalHeight);
   if(!blob||!alive.current)return;
   const task=new AbortController();controller.current=task;
   const timer=setTimeout(()=>task.abort(),15000);
   try{await storePhotoThumbnail(photo,blob,fetch,task.signal);}finally{clearTimeout(timer);}
  }catch{/* The original stays usable if this optional preview cannot be saved. */}
 }
 return <img src={localUrl||(fallback?photoUrl(photo):thumbnailUrl(photo))} width={480} height={360} alt={photo.filename} loading="lazy" decoding="async"
  onLoad={event=>void loaded(event.currentTarget)} onError={()=>{if(!fallback)setFallback(true);}}/>;
}
