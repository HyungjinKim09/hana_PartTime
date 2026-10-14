CREATE TABLE site_members(id TEXT PRIMARY KEY,owner TEXT NOT NULL,username TEXT NOT NULL COLLATE NOCASE,display_name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(owner,username));
--> statement-breakpoint
ALTER TABLE site_sessions ADD COLUMN member_id TEXT;
--> statement-breakpoint
ALTER TABLE site_sessions ADD COLUMN member_version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE site_refresh_sessions ADD COLUMN member_id TEXT;
--> statement-breakpoint
ALTER TABLE site_refresh_sessions ADD COLUMN member_version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX site_refresh_sessions_member ON site_refresh_sessions(member_id);
--> statement-breakpoint
CREATE TRIGGER members_reserved_username BEFORE INSERT ON site_members WHEN EXISTS(SELECT 1 FROM site_account WHERE owner=NEW.owner AND username=NEW.username COLLATE NOCASE) BEGIN SELECT RAISE(ABORT,'reserved_username'); END;
--> statement-breakpoint
CREATE TRIGGER account_reserved_username BEFORE UPDATE OF username ON site_account WHEN EXISTS(SELECT 1 FROM site_members WHERE owner=NEW.owner AND username=NEW.username COLLATE NOCASE) BEGIN SELECT RAISE(ABORT,'reserved_username'); END;
--> statement-breakpoint
DELETE FROM site_sessions;
--> statement-breakpoint
DELETE FROM site_refresh_sessions;
