ALTER TABLE survey_folders ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE upload_receipts (
 owner TEXT NOT NULL, id TEXT NOT NULL, folder TEXT NOT NULL, kind TEXT NOT NULL,
 filename TEXT NOT NULL, fingerprint TEXT NOT NULL, photo_id TEXT NOT NULL,
 state TEXT NOT NULL, attempt TEXT NOT NULL, started_at INTEGER NOT NULL,
 PRIMARY KEY(owner,id)
);
--> statement-breakpoint
CREATE TABLE upload_attempts (object_key TEXT PRIMARY KEY, owner TEXT NOT NULL, upload_id TEXT NOT NULL, started_at INTEGER NOT NULL);
