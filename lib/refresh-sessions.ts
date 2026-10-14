import {COOKIE,REFRESH_COOKIE,cookieValue,digest,memberSessionValid} from './session-lookup';

export const ACCESS_SECONDS=15*60,REFRESH_SECONDS=90*24*60*60;
const OVERLAP_MS=60_000;
type Pair={access:string;refresh:string;refreshSeconds:number};
type Family={id:string;token_hash:string;previous_hash:string|null;previous_until:number;version:number;expires_at:number};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
const familyId=(token:string)=>/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)?token.slice(0,32):'';
// Deterministic successors let concurrent requests return exactly the same pair
// without storing recoverable tokens. The server secret prevents deriving future
// tokens from an old token alone. Domain separation keeps access/refresh distinct.
async function derive(secret:string|undefined,purpose:string,token:string){
  if(!secret||secret.length<32)throw Error('Session signing key is unavailable');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('hana-session-v1:'+purpose+':'+token)));
}
export function tokenCookies(pair:Pair|null){
  const cookie=(name:string,value:string,seconds:number)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
  return [cookie(COOKIE,pair?.access||'',pair?ACCESS_SECONDS:0),cookie(REFRESH_COOKIE,pair?.refresh||'',pair?.refreshSeconds||0)];
}
export function sessionHeaders(pair:Pair|null){const headers=new Headers({'Cache-Control':'private, no-store'});for(const cookie of tokenCookies(pair))headers.append('Set-Cookie',cookie);return headers;}
export async function createSession(db:D1Database,version:number,secret:string|undefined,memberId:string|null=null,memberVersion=1):Promise<Pair>{
  const now=Date.now(),id=random().slice(0,32),refresh=id+'.'+random(),access=await derive(secret,'access',refresh);
  const rh=await digest(refresh),ah=await digest(access);
  await db.batch([
    db.prepare('DELETE FROM site_sessions WHERE expires_at<? OR (family_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM site_refresh_sessions r WHERE r.id=family_id AND r.expires_at>?))').bind(now-86400000,now),
    db.prepare('DELETE FROM site_refresh_sessions WHERE expires_at<=?').bind(now),
    db.prepare('INSERT INTO site_refresh_sessions(id,token_hash,version,expires_at,member_id,member_version) SELECT ?,?,?,?,?,? FROM site_account a WHERE a.id=1 AND a.version=? AND (? IS NULL OR EXISTS(SELECT 1 FROM site_members m WHERE m.id=? AND m.owner=a.owner AND m.active=1 AND m.version=?))').bind(id,rh,version,now+REFRESH_SECONDS*1000,memberId,memberVersion,version,memberId,memberId,memberVersion),
    db.prepare('INSERT INTO site_sessions(token_hash,version,expires_at,family_id,member_id,member_version) SELECT ?,version,?,id,member_id,member_version FROM site_refresh_sessions WHERE id=?').bind(ah,now+ACCESS_SECONDS*1000,id),
  ]);
  if(!await db.prepare('SELECT id FROM site_refresh_sessions WHERE id=?').bind(id).first())throw Error('Account changed while signing in');
  return {access,refresh,refreshSeconds:REFRESH_SECONDS};
}
export async function refreshSession(db:D1Database,cookies:string,secret:string|undefined):Promise<Pair|null>{
  const token=cookieValue(cookies,REFRESH_COOKIE),id=familyId(token);if(!id)return null;
  const now=Date.now(),rh=await digest(token);
  const row=await db.prepare(`SELECT r.* FROM site_refresh_sessions r JOIN site_account a ON a.id=1 AND a.version=r.version WHERE r.id=? AND r.expires_at>? AND ${memberSessionValid('r')}`).bind(id,now).first<Family>();
  if(!row)return null;
  const current=row.token_hash===rh,previous=row.previous_hash===rh&&row.previous_until>now;
  if(!current&&!previous)return null;
  // Do not advance another generation during the overlap window: late responses
  // from parallel tabs then cannot overwrite a newer generation's cookie.
  const rotate=current&&row.previous_until<=now;
  const refresh=current&&!rotate?token:id+'.'+await derive(secret,'refresh',token);
  const nextHash=await digest(refresh),access=await derive(secret,'access',refresh),ah=await digest(access);
  const statements:D1PreparedStatement[]=[
    // Keep expired access proofs briefly for racing logout, then reclaim them.
    db.prepare('DELETE FROM site_sessions WHERE expires_at<?').bind(now-86400000),
    db.prepare('DELETE FROM site_refresh_sessions WHERE expires_at<=?').bind(now),
  ];
  if(rotate)statements.push(db.prepare(`UPDATE site_refresh_sessions SET token_hash=?,previous_hash=?,previous_until=?,expires_at=? WHERE id=? AND token_hash=? AND expires_at>? AND ${memberSessionValid('site_refresh_sessions')} AND EXISTS(SELECT 1 FROM site_account WHERE id=1 AND version=site_refresh_sessions.version)`).bind(nextHash,rh,now+OVERLAP_MS,now+REFRESH_SECONDS*1000,id,rh,now));
  statements.push(db.prepare(`INSERT INTO site_sessions(token_hash,version,expires_at,family_id,member_id,member_version) SELECT ?,r.version,?,r.id,r.member_id,r.member_version FROM site_refresh_sessions r JOIN site_account a ON a.id=1 AND a.version=r.version WHERE r.id=? AND r.token_hash=? AND r.expires_at>? AND ${memberSessionValid('r')} ON CONFLICT(token_hash) DO UPDATE SET expires_at=excluded.expires_at`).bind(ah,now+ACCESS_SECONDS*1000,id,nextHash,now));
  const results=await db.batch(statements);
  if(!results.at(-1)?.meta.changes)return null; // Deleted/reset family must never be resurrected.
  const active=await db.prepare(`SELECT r.expires_at FROM site_refresh_sessions r JOIN site_account a ON a.id=1 AND a.version=r.version WHERE r.id=? AND r.token_hash=? AND r.expires_at>? AND ${memberSessionValid('r')}`).bind(id,nextHash,now).first<{expires_at:number}>();
  if(!active)return null;
  return {access,refresh,refreshSeconds:Math.max(1,Math.floor((active.expires_at-now)/1000))};
}
export async function upgradeLegacySession(db:D1Database,cookies:string,secret:string|undefined):Promise<Pair|null>{
  const token=cookieValue(cookies,COOKIE);if(!/^[a-f0-9]{64}$/.test(token))return null;
  const now=Date.now(),ah=await digest(token);
  const old=await db.prepare('SELECT s.family_id FROM site_sessions s JOIN site_account a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.expires_at>?').bind(ah,now).first<{family_id:string|null}>();
  if(!old)return null;
  const id=(await derive(secret,'legacy-family',token)).slice(0,32);
  if(old.family_id&&old.family_id!==id)return null; // New access tokens cannot become refresh credentials.
  const refresh=id+'.'+await derive(secret,'legacy-refresh',token),rh=await digest(refresh),access=await derive(secret,'access',refresh),nextAccess=await digest(access);
  const results=await db.batch([
    db.prepare('INSERT OR IGNORE INTO site_refresh_sessions(id,token_hash,version,expires_at) SELECT ?,?,s.version,? FROM site_sessions s JOIN site_account a ON a.id=1 AND a.version=s.version WHERE s.token_hash=? AND s.expires_at>? AND s.family_id IS NULL').bind(id,rh,now+REFRESH_SECONDS*1000,ah,now),
    db.prepare('UPDATE site_sessions SET family_id=?,expires_at=MIN(expires_at,?) WHERE token_hash=? AND (family_id IS NULL OR family_id=?) AND EXISTS(SELECT 1 FROM site_refresh_sessions r JOIN site_account a ON a.id=1 AND a.version=r.version WHERE r.id=? AND r.token_hash=? AND r.expires_at>?)').bind(id,now+ACCESS_SECONDS*1000,ah,id,id,rh,now),
    db.prepare('INSERT INTO site_sessions(token_hash,version,expires_at,family_id) SELECT ?,r.version,?,r.id FROM site_refresh_sessions r JOIN site_account a ON a.id=1 AND a.version=r.version WHERE r.id=? AND r.token_hash=? AND r.expires_at>? ON CONFLICT(token_hash) DO NOTHING').bind(nextAccess,now+ACCESS_SECONDS*1000,id,rh,now),
  ]);
  if(!results[1].meta.changes)return null;
  const active=await db.prepare('SELECT expires_at FROM site_refresh_sessions WHERE id=? AND token_hash=?').bind(id,rh).first<{expires_at:number}>();
  return active?{access,refresh,refreshSeconds:Math.max(1,Math.floor((active.expires_at-now)/1000))}:null;
}
export async function revokeTokens(db:D1Database,cookies:string){
  const access=cookieValue(cookies,COOKIE),refresh=cookieValue(cookies,REFRESH_COOKIE),ah=await digest(access),rh=await digest(refresh);
  await db.batch([
    // Either proof is sufficient, including an expired access token or the
    // preceding refresh token from an in-flight request racing this logout.
    db.prepare('DELETE FROM site_refresh_sessions WHERE id IN(SELECT family_id FROM site_sessions WHERE token_hash=?) OR (id=? AND (token_hash=? OR previous_hash=?))').bind(ah,familyId(refresh),rh,rh),
    db.prepare('DELETE FROM site_sessions WHERE token_hash=? OR (family_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM site_refresh_sessions r WHERE r.id=family_id))').bind(ah),
  ]);
}
