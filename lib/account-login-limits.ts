const WINDOW_MS=15*60_000;

export async function accountRetryAfter(db:D1Database,key:string,now=Date.now()){
  const row=await db.prepare('SELECT blocked_until FROM site_account_login_limits WHERE key=? AND expires_at>?').bind(key,now).first<{blocked_until:number}>();
  return Math.max(0,Math.ceil(((row?.blocked_until??0)-now)/1000));
}

export async function recordAccountFailure(db:D1Database,key:string,now=Date.now()){
  await db.batch([
    db.prepare('DELETE FROM site_account_login_limits WHERE key IN (SELECT key FROM site_account_login_limits WHERE expires_at<=? ORDER BY expires_at LIMIT 32)').bind(now),
    db.prepare('DELETE FROM site_account_login_limits WHERE key=? AND expires_at<=?').bind(key,now),
    // Late failures from requests already verifying a password cannot extend an active cooldown.
    db.prepare(`INSERT INTO site_account_login_limits (key,failures,blocked_until,expires_at) VALUES (?,1,0,?)
      ON CONFLICT(key) DO UPDATE SET
        failures=MIN(failures+1,9),
        blocked_until=CASE WHEN failures<4 THEN 0 ELSE ?+MIN(300000,30000 << (failures-4)) END,
        expires_at=excluded.expires_at
      WHERE blocked_until<=?`).bind(key,now+WINDOW_MS,now,now),
  ]);
}

export async function clearAccountFailures(db:D1Database,key:string){
  await db.prepare('DELETE FROM site_account_login_limits WHERE key=?').bind(key).run();
}
