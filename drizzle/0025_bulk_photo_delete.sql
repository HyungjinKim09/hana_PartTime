ALTER TABLE photos ADD COLUMN delete_batch TEXT;
--> statement-breakpoint
CREATE INDEX photos_owner_delete_batch ON photos(owner,delete_batch) WHERE delete_batch IS NOT NULL;
--> statement-breakpoint
CREATE TABLE photo_delete_jobs (
 owner TEXT NOT NULL,
 id TEXT NOT NULL,
 actor TEXT NOT NULL,
 folders TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 started_by TEXT,
 PRIMARY KEY (owner,id)
);
