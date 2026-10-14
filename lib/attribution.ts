import type {SessionUser} from './session-lookup';
export type Attribution={id:string;name:string;at:string;restored?:boolean};
export function attribution(user:SessionUser,activity?:string):string{return JSON.stringify({id:user.memberId||'admin',name:user.memberId?user.displayName:'관리자',at:new Date().toISOString(),activity});}
export function parseAttribution(value:unknown):Attribution|undefined{if(typeof value!=='string'||!value)return undefined;try{const parsed=JSON.parse(value);return {id:parsed.id,name:parsed.name,at:parsed.at,...(parsed.restored===true?{restored:true}:{})} as Attribution;}catch{return undefined;}}
export function attributed<T extends Record<string,unknown>>(row:T){const {created_by,updated_by,deleted_by,restored,...data}=row;void deleted_by;return {...data,restored:restored?true:undefined,createdBy:parseAttribution(created_by),updatedBy:parseAttribution(updated_by)};}
