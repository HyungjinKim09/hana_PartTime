import {AsyncLocalStorage} from 'node:async_hooks';
import type {SessionUser} from './session-lookup';

// The worker installs a context for one fetch invocation. No identity comes
// from a client header and no verification result survives the request.
const context=new AsyncLocalStorage<WeakMap<D1Database,Map<string,Promise<SessionUser|null>>>>();
export function withSessionRequest<T>(work:()=>T):T{return context.run(new WeakMap(),work);}
export function invalidateSessionLookup(db:D1Database){context.getStore()?.delete(db);}
export function requestSession(db:D1Database,token:string,read:()=>Promise<SessionUser|null>){
 const scope=context.getStore();if(!scope)return read();
 let tokens=scope.get(db);if(!tokens){tokens=new Map();scope.set(db,tokens);}
 let result=tokens.get(token);if(!result){result=read();tokens.set(token,result);}
 return result;
}
