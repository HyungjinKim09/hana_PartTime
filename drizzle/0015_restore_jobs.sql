CREATE TABLE restore_jobs(owner TEXT NOT NULL,id TEXT NOT NULL,manifest_hash TEXT NOT NULL,prefix TEXT NOT NULL,status TEXT NOT NULL,header TEXT NOT NULL,folders INTEGER NOT NULL,photos INTEGER NOT NULL,sources INTEGER NOT NULL,drawings INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner,id));
--> statement-breakpoint
CREATE TABLE restore_records(owner TEXT NOT NULL,job TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,target_id TEXT NOT NULL,position INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(owner,job,kind,id),UNIQUE(owner,job,kind,position));
--> statement-breakpoint
CREATE TABLE restore_objects(owner TEXT NOT NULL,job TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,object_key TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,content_type TEXT NOT NULL,PRIMARY KEY(owner,job,kind,id));
