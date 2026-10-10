CREATE TABLE site_refresh_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL,
  previous_hash TEXT,
  previous_until INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX site_refresh_sessions_expiry ON site_refresh_sessions(expires_at);
--> statement-breakpoint
ALTER TABLE site_sessions ADD COLUMN family_id TEXT;
--> statement-breakpoint
CREATE INDEX site_sessions_family ON site_sessions(family_id);
--> statement-breakpoint
CREATE INDEX site_sessions_expiry ON site_sessions(expires_at);
