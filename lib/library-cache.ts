type Entry={data?:unknown;at:number;promise?:Promise<unknown>;controller?:AbortController};
export class LibraryRequestError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}
/** Private memory owned by one mounted workspace. Nothing is persisted/shared across logins. */
export class LibraryCache{
 private entries=new Map<string,Entry>();
 private ttl:number;private capacity:number;
 constructor(ttl=5*60_000,capacity=80){this.ttl=ttl;this.capacity=capacity;}
 private key(url:string){const u=new URL(url,'https://library.invalid');u.searchParams.sort();return u.origin+u.pathname+'?'+u.searchParams;}
 peek<T>(url:string):T|undefined{return this.entries.get(this.key(url))?.data as T|undefined;}
 fresh(url:string){const entry=this.entries.get(this.key(url));return !!entry?.data&&Date.now()-entry.at<this.ttl;}
 async get<T>(url:string):Promise<T>{
  const key=this.key(url);let entry=this.entries.get(key);
  if(entry?.data&&Date.now()-entry.at<this.ttl){this.entries.delete(key);this.entries.set(key,entry);return entry.data as T;}
  if(entry?.promise)return entry.promise as Promise<T>;
  if(!entry){entry={at:0};this.entries.set(key,entry);}const current=entry,controller=new AbortController();current.controller=controller;
  current.promise=(async()=>{const response=await fetch(url,{cache:'no-store',signal:controller.signal});const data=await response.json() as {error?:string};
   if(!response.ok){if(response.status===401)this.clear();throw new LibraryRequestError(data.error||'불러오지 못했습니다.',response.status);}
   if(this.entries.get(key)===current){current.data=data;current.at=Date.now();}return data;
  })().finally(()=>{if(this.entries.get(key)===current){current.promise=undefined;current.controller=undefined;}});
  while(this.entries.size>this.capacity){const old=[...this.entries].find(([k,v])=>k!==key&&!v.promise);if(!old)break;this.entries.delete(old[0]);}
  return current.promise as Promise<T>;
 }
 set<T>(url:string,data:T){const key=this.key(url);this.entries.get(key)?.controller?.abort();this.entries.set(key,{data,at:Date.now()});}
 invalidate(match:(url:string)=>boolean=()=>true){for(const [key,entry]of this.entries)if(match(key)){entry.controller?.abort();this.entries.set(key,{data:entry.data,at:0});}}
 clear(){for(const entry of this.entries.values())entry.controller?.abort();this.entries.clear();}
}
