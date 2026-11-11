import {Buffer} from 'node:buffer';
import type {SessionUser} from './session-lookup';

export const ACCESS_SECONDS=15*60;
type Claims={proof:string;expires:number;user:SessionUser};
const encoder=new TextEncoder();
const proofPattern=/^[a-f0-9]{64}$/;
const prefix='hana-access-v1.';
function signingKey(secret:string){
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}

export async function signAccess(secret:string|undefined,claims:Claims){
  if(!secret||secret.length<32)throw Error('Session signing key is unavailable');
  const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature=await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(prefix+payload));
  return prefix+payload+'.'+Buffer.from(signature).toString('base64url');
}

export async function verifyAccess(secret:string|undefined,token:string):Promise<Claims|null>{
  if(!secret||secret.length<32||token.length>2048||!token.startsWith(prefix))return null;
  const parts=token.slice(prefix.length).split('.');
  if(parts.length!==2||!/^[\w-]+$/.test(parts[0])||!/^[\w-]{43}$/.test(parts[1]))return null;
  const [payload,signature]=parts;
  const bytes=Buffer.from(signature,'base64url');
  if(bytes.toString('base64url')!==signature)return null;
  if(!await crypto.subtle.verify('HMAC',await signingKey(secret),bytes,encoder.encode(prefix+payload)))return null;
  try{
    const claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as Claims;
    if(!proofPattern.test(claims.proof)||!Number.isSafeInteger(claims.expires)||claims.expires>Date.now()+ACCESS_SECONDS*1000)return null;
    return claims;
  }catch{return null;}
}
