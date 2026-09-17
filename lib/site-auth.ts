import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';

export const COOKIE='__Host-fieldnote_session';
export const SESSION_SECONDS=7*24*60*60;
type Account={owner:string;username:string;salt:string;password_hash:string;version:number};
const db=()=>env.DB as D1Database;
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
export async function passwordHash(password:string,salt:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));
}
export function equalHash(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export async function getAccount(){return db().prepare('SELECT owner,username,salt,password_hash,version FROM site_account WHERE id=1').first<Account>();}
export async function validAdminKey(key:string){
  const expected=env.ADMIN_SETUP_KEY;
  if(!expected || expected.length<32 || key.length<32 || key.length>256)return false;
  return equalHash(await digest(key),await digest(expected));
}
export async function sessionUser(){
  const cookie=(await headers()).get('cookie')||'';
  const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return db().prepare('SELECT a.owner,a.username FROM site_sessions s JOIN site_account a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first<{owner:string;username:string}>();
}
export function sessionCookie(token:string,maxAge=SESSION_SECONDS){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export async function issueSession(version:number){
  const token=randomToken();await db().prepare('INSERT INTO site_sessions (token_hash,version,expires_at) VALUES (?,?,?)').bind(await digest(token),version,Date.now()+SESSION_SECONDS*1000).run();
  await db().prepare('DELETE FROM site_sessions WHERE expires_at<=?').bind(Date.now()).run();return token;
}
export async function revokeSession(request:Request){
  const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(token)await db().prepare('DELETE FROM site_sessions WHERE token_hash=?').bind(await digest(token)).run();
}
export async function allowLogin(request:Request,scope='login'){
  const now=Date.now(),window=Math.floor(now/900000);
  const key=await digest(`${scope}:${request.headers.get('cf-connecting-ip')||'unknown'}:${window}`);
  const row=await db().prepare('INSERT INTO site_login_limits (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,now+900000).first<{attempts:number}>();
  await db().prepare('DELETE FROM site_login_limits WHERE expires_at<?').bind(now).run();
  return !!row&&row.attempts<=15;
}
