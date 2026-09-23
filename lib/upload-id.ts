const identities=new WeakMap<File,string>();
export function identifyUpload(file:File,id:string){identities.set(file,id);return file;}
export function uploadId(file:File){let id=identities.get(file);if(!id){id=crypto.randomUUID();identities.set(file,id);}return id;}
