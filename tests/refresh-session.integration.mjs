import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {testRuntime,png,expiredAccess} from './test-runtime.mjs';

// Undici (Miniflare's HTTP test transport) overwrites Sec-Fetch-Mode with cors.
// A test-only ingress supplies the exact metadata a browser document navigation
// sends. The production worker receives a normal Request, with no test hook.
const t=await testRuntime({entryWrapper:`import worker from './index.js';
export default {fetch(request,env,ctx){
 if(request.headers.get('x-synthetic-navigation')==='1'){
  const headers=new Headers(request.headers);headers.delete('x-synthetic-navigation');headers.delete('origin');
  headers.set('sec-fetch-site','cross-site');headers.set('sec-fetch-mode','navigate');headers.set('sec-fetch-dest','document');
  request=new Request(request,{headers});
 }
 return worker.fetch(request,env,ctx);
}};`});
const accessName='__Host-fieldnote_session',refreshName='__Host-hana_refresh';
const hash=value=>createHash('sha256').update(value).digest('hex');
const cookies=response=>Object.fromEntries(response.headers.getSetCookie().map(c=>{const pair=c.split(';')[0],i=pair.indexOf('=');return [pair.slice(0,i),pair.slice(i+1)];}));
const header=jar=>Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');
const call=(path,jar={},options={})=>t.request(path,{...options,headers:{cookie:header(jar),...options.headers}});
let loginNumber=0;
const login=async()=>{const r=await call('/api/session',{}, {method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.'+(++loginNumber)},body:JSON.stringify({username:'synthetic',password:'synthetic-password-12345'})});assert.equal(r.status,200);return r;};
const expire=jar=>{jar[accessName]=expiredAccess(jar[accessName],t.adminKey);};
const refresh=jar=>call('/api/session/refresh',jar,{method:'POST'});
try{
 const first=await login(),initial=cookies(first);
 assert.ok(initial[refreshName],'Login must issue a refresh cookie');
 for(const value of first.headers.getSetCookie()){assert.match(value,/HttpOnly/);assert.match(value,/Secure/);assert.match(value,/SameSite=Lax/);assert.match(value,/Path=\//);}
 assert.match(first.headers.getSetCookie().find(c=>c.startsWith(accessName+'=')),/Max-Age=900(?:;|$)/);
 assert.match(first.headers.getSetCookie().find(c=>c.startsWith(refreshName+'=')),/Max-Age=7776000(?:;|$)/);
 const id=initial[refreshName].split('.')[0];
 const row=await t.db.prepare('SELECT * FROM site_refresh_sessions WHERE id=?').bind(id).first();
 assert.equal(row.token_hash,hash(initial[refreshName]));assert.ok(!JSON.stringify(row).includes(initial[refreshName]));
 assert.equal((await call('/api/library',initial)).headers.getSetCookie().length,0,'Ordinary requests do not rotate valid access tokens');
 assert.equal((await call('/api/library',{[accessName]:initial[accessName]})).headers.getSetCookie().length,0,'A new access token alone is not a refresh credential');
 assert.equal((await refresh({[refreshName]:id+'.'+'b'.repeat(64)})).status,401,'A known family ID is not sufficient proof');
 await t.db.prepare('UPDATE site_refresh_sessions SET expires_at=? WHERE id=?').bind(Date.now()+60000,id).run();
 await expire(initial);
 const crossSite=await call('/api/library',initial,{headers:{origin:'https://evil.test','sec-fetch-site':'cross-site','sec-fetch-dest':'image'}});
 assert.equal(crossSite.status,401);assert.equal(crossSite.headers.getSetCookie().length,0,'Cross-site subresources cannot renew expired access');
 const page=await call('/',initial,{headers:{'x-synthetic-navigation':'1'}});assert.equal(page.status,200);assert.ok((await page.text()).includes('synthetic'),'Opening a shared link must retain login');
 const current=cookies(page);assert.ok(current[refreshName]);assert.notEqual(current[refreshName],initial[refreshName]);
 assert.ok((await t.db.prepare('SELECT expires_at FROM site_refresh_sessions WHERE id=?').bind(id).first()).expires_at>Date.now()+89*86400000);
 // Simultaneous tabs all receive the same successor; no token can overwrite a different winner.
 const parallel=await Promise.all(Array.from({length:6},()=>refresh(initial)));
 for(const r of parallel){assert.equal(r.status,200);assert.deepEqual(cookies(r),current);}
 await t.db.prepare('UPDATE site_refresh_sessions SET previous_until=0 WHERE id=?').bind(id).run();
 assert.equal((await refresh(initial)).status,401,'Old refresh rejected beyond overlap window');
 assert.equal((await call('/api/library',current)).status,200,'Rejected old token cannot invalidate the current device');
 const before=await t.db.prepare('SELECT token_hash FROM site_refresh_sessions WHERE id=?').bind(id).first();
 assert.equal((await call('/api/session/refresh',current,{method:'POST',headers:{origin:'https://evil.test','sec-fetch-site':'cross-site'}})).status,403);
 assert.deepEqual(await t.db.prepare('SELECT token_hash FROM site_refresh_sessions WHERE id=?').bind(id).first(),before);
 await expire(current);await t.folder('refresh-photo');
 const upload=await call('/api/library?folder=refresh-photo&filename=original.png',current,{method:'POST',body:png});assert.equal(upload.status,201);
 const uploaded=(await upload.json()).photo;const afterUpload=cookies(upload);assert.ok(afterUpload[refreshName]);
 const manifest=await call('/api/export?folder=refresh-photo&photosOnly=1',afterUpload,{method:'POST'});assert.equal(manifest.status,200);
 const entry=(await manifest.json()).entries.find(e=>e.url);
 await expire(afterUpload);
 const original=await call(entry.url,afterUpload);assert.equal(original.status,200);assert.deepEqual(Buffer.from(await original.arrayBuffer()),png);
 const afterDownload=cookies(original);assert.ok(afterDownload[refreshName],'Native original stream carries refreshed cookies');
 const second=cookies(await login());
 await expire(afterDownload);
 const logout=await call('/api/session',{[refreshName]:afterDownload[refreshName]},{method:'DELETE'});assert.equal(logout.status,200);
 assert.equal(logout.headers.getSetCookie().length,2);for(const c of logout.headers.getSetCookie())assert.match(c,/Max-Age=0(?:;|$)/);
 assert.equal(await t.db.prepare('SELECT id FROM site_refresh_sessions WHERE id=?').bind(id).first(),null);
 assert.equal((await call('/api/photos/'+uploaded.id,afterDownload)).status,401);
 assert.equal((await refresh(afterDownload)).status,401);assert.equal((await call('/api/library',second)).status,200);
 // A refresh racing logout must not recreate the deleted family, whichever operation wins.
 const racing=cookies(await login());await expire(racing);
 const [renewed,ended]=await Promise.all([refresh(racing),call('/api/session',racing,{method:'DELETE'})]);assert.equal(ended.status,200);
 if(renewed.status===200)assert.equal((await call('/api/members',cookies(renewed))).status,401);
 assert.equal((await refresh(racing)).status,401);
 const inactive=cookies(await login());await t.db.prepare('UPDATE site_refresh_sessions SET expires_at=0 WHERE id=?').bind(inactive[refreshName].split('.')[0]).run();
 assert.equal((await call('/api/members',inactive)).status,401,'Idle expiry prevents privileged reads');
 // Existing valid seven-day sessions upgrade without requiring another login.
 const legacy='a'.repeat(64),version=(await t.db.prepare('SELECT version FROM site_account WHERE id=1').first()).version;
 await t.db.prepare('INSERT INTO site_sessions(token_hash,version,expires_at) VALUES(?,?,?)').bind(hash(legacy),version,Date.now()+7*86400000).run();
 const legacyJar={[accessName]:legacy};
 const upgraded=await Promise.all([call('/',legacyJar),call('/',legacyJar)]);
 for(const r of upgraded){assert.equal(r.status,200);assert.ok(cookies(r)[refreshName],'Legacy login gains refresh cookie');}
 assert.deepEqual(cookies(upgraded[0]),cookies(upgraded[1]));
 assert.ok((await t.db.prepare('SELECT expires_at FROM site_sessions WHERE token_hash=?').bind(hash(legacy)).first()).expires_at<=Date.now()+900000);
 assert.equal((await call('/api/session',legacyJar,{method:'DELETE'})).status,200);
 assert.equal((await refresh(cookies(upgraded[0]))).status,401,'Old proof logout revokes upgraded session too');
 const reset=await call('/api/account',{}, {method:'POST',headers:{'content-type':'application/json','x-admin-key':t.adminKey},body:JSON.stringify({username:'synthetic',password:'replacement-password-12345'})});assert.equal(reset.status,200);
 assert.equal((await refresh(second)).status,401);assert.equal((await call('/api/members',second)).status,401);
 console.log('PASS: secure 15m/90d cookies, hash-only persistence, sliding expiry, automatic SSR/upload/ZIP refresh, concurrent tabs, replay window, logout/race, device isolation, inactivity, legacy upgrade and reset revocation');
}finally{await t.close();}
