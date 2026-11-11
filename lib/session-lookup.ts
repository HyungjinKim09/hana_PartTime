export const COOKIE='__Host-fieldnote_session';
export const REFRESH_COOKIE='__Host-hana_refresh';
export type SessionUser={owner:string;username:string;displayName:string;memberId:string|null;isAdmin:boolean};
export const memberSessionValid=(alias:string)=>`(${alias}.member_id IS NULL OR EXISTS(SELECT 1 FROM site_members m JOIN site_account a ON a.id=1 AND a.owner=m.owner WHERE m.id=${alias}.member_id AND m.version=${alias}.member_version AND m.active=1))`;
export function cookieValue(cookie:string,name:string){return cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export async function digest(value:string){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function lookupSession(db:D1Database,cookie:string){
  const token=cookieValue(cookie,COOKIE);
  if(!token)return null;
  if(/^[a-f0-9]{64}$/.test(token))return lookupAccessProof(db,token);
  const claims=await requestAccess(token);
  if(!claims||claims.expires<=Date.now())return null;
  if(signedReadAllowed())return claims.user;
  return lookupAccessProof(db,claims.proof);
}
export function lookupAccessProof(db:D1Database,token:string){
  return requestSession(db,token,async()=>{
  const now=Date.now();
  const user=await db.prepare(`SELECT a.owner,COALESCE(m.username,a.username) AS username,COALESCE(m.display_name,'관리자 ('||a.username||')') AS displayName,s.member_id AS memberId,(s.member_id IS NULL) AS isAdmin FROM site_sessions s JOIN site_account a ON a.id=1 AND a.version=s.version LEFT JOIN site_members m ON m.id=s.member_id AND m.owner=a.owner WHERE s.token_hash=? AND s.expires_at>? AND ${memberSessionValid('s')} AND (s.family_id IS NULL OR EXISTS(SELECT 1 FROM site_refresh_sessions r WHERE r.id=s.family_id AND r.version=a.version AND r.member_id IS s.member_id AND r.member_version=s.member_version AND r.expires_at>?))`).bind(await digest(token),now,now).first<SessionUser>();return user?{...user,isAdmin:!!user.isAdmin}:null;
  });
}
import {requestAccess,requestSession,signedReadAllowed} from './session-context.ts';
