import {AsyncLocalStorage} from 'node:async_hooks';
import type {SessionUser} from './session-lookup';
import {verifyAccess} from './signed-access.ts';

type RequestScope={
  lookups:WeakMap<D1Database,Map<string,Promise<SessionUser|null>>>;
  signed:Map<string,ReturnType<typeof verifyAccess>>;
  secret?:string;
  allowSignedRead:boolean;
};
const context=new AsyncLocalStorage<RequestScope>();
export function withSessionRequest<T>(work:()=>T,secret?:string,allowSignedRead=false):T{
  return context.run({lookups:new WeakMap(),signed:new Map(),secret,allowSignedRead},work);
}
export function signedReadAllowed(){return context.getStore()?.allowSignedRead===true;}
export function requestAccess(token:string){
  const scope=context.getStore();
  if(!scope)return Promise.resolve(null);
  let claims=scope.signed.get(token);
  if(!claims){claims=verifyAccess(scope.secret,token);scope.signed.set(token,claims);}
  return claims;
}
export function invalidateSessionLookup(db:D1Database){context.getStore()?.lookups.delete(db);}
export function requestSession(db:D1Database,token:string,read:()=>Promise<SessionUser|null>){
  const scope=context.getStore()?.lookups;if(!scope)return read();
  let tokens=scope.get(db);if(!tokens){tokens=new Map();scope.set(db,tokens);}
  let result=tokens.get(token);if(!result){result=read();tokens.set(token,result);}
  return result;
}
