export const COOKIE='__Host-fieldnote_session';
export async function digest(value:string){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function lookupSession(db:D1Database,cookie:string){
  const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return db.prepare('SELECT a.owner,a.username FROM site_sessions s JOIN site_account a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first<{owner:string;username:string}>();
}
