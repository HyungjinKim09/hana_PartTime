CREATE TABLE site_account_login_limits (
  key TEXT PRIMARY KEY NOT NULL,
  failures INTEGER NOT NULL CHECK (failures BETWEEN 1 AND 9),
  blocked_until INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX site_account_login_limits_expiry ON site_account_login_limits(expires_at);
