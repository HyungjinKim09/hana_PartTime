CREATE TABLE drawing_drafts (photo_id TEXT PRIMARY KEY, owner TEXT NOT NULL, draft TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER photos_delete_drawing AFTER DELETE ON photos BEGIN DELETE FROM drawing_drafts WHERE photo_id=OLD.id; END;
--> statement-breakpoint
CREATE TABLE drawing_ai_usage (day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0);
