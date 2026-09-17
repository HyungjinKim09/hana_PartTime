CREATE TABLE r2_download_tickets (
  token TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  object_key TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX r2_download_tickets_expiry ON r2_download_tickets(expires_at);
