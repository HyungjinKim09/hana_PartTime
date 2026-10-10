export const COOKIE='__Host-fieldnote_session';
export const REFRESH_COOKIE='__Host-hana_refresh';
export function cookieValue(cookie:string,name:string){return cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export async function digest(value:string){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function lookupSession(db:D1Database,cookie:string){
  const token=cookieValue(cookie,COOKIE);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const now=Date.now();
  return db.prepare('SELECT a.owner,a.username FROM site_sessions s JOIN site_account a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.expires_at>? AND (s.family_id IS NULL OR EXISTS(SELECT 1 FROM site_refresh_sessions r WHERE r.id=s.family_id AND r.version=a.version AND r.expires_at>?))').bind(await digest(token),now,now).first<{owner:string;username:string}>();
}
