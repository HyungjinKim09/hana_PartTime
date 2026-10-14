CREATE TABLE activity_log(owner TEXT NOT NULL,id TEXT NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,folder_id TEXT,label TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'complete',created_at TEXT NOT NULL,PRIMARY KEY(owner,id));
--> statement-breakpoint
CREATE INDEX activity_owner_time ON activity_log(owner,created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX activity_owner_folder_time ON activity_log(owner,folder_id,created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX activity_owner_actor_time ON activity_log(owner,actor_id,created_at DESC,id DESC);
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN created_by TEXT;
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN deleted_by TEXT;
--> statement-breakpoint
ALTER TABLE photos ADD COLUMN restored INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN created_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN updated_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN schedule_updated_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN survey_updated_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN deleted_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN restored INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE drawing_drafts ADD COLUMN updated_by TEXT;
--> statement-breakpoint
ALTER TABLE drawing_drafts ADD COLUMN restored INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE schedule_imports ADD COLUMN created_by TEXT;
--> statement-breakpoint
ALTER TABLE schedule_imports ADD COLUMN restored INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE upload_receipts ADD COLUMN actor TEXT;
--> statement-breakpoint
CREATE TRIGGER activity_photo_add AFTER INSERT ON photos WHEN NEW.created_by IS NOT NULL AND NEW.restored=0 BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'photo:add:'||NEW.id,json_extract(NEW.created_by,'$.id'),json_extract(NEW.created_by,'$.name'),'photo.added',NEW.kind,NEW.id,NEW.folder,NEW.filename,'complete',json_extract(NEW.created_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_photo_delete AFTER UPDATE OF deleted ON photos WHEN OLD.deleted=0 AND NEW.deleted=1 AND NEW.deleted_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM survey_folders f WHERE f.owner=NEW.owner AND f.id=NEW.folder AND f.deleting=1) BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'photo:delete:'||NEW.id,json_extract(NEW.deleted_by,'$.id'),json_extract(NEW.deleted_by,'$.name'),'photo.deleted',NEW.kind,NEW.id,NEW.folder,NEW.filename,'pending',json_extract(NEW.deleted_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_folder_add AFTER INSERT ON survey_folders WHEN NEW.created_by IS NOT NULL AND NEW.restored=0 BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'folder:add:'||NEW.id,json_extract(NEW.created_by,'$.id'),json_extract(NEW.created_by,'$.name'),'folder.added','folder',NEW.id,NEW.id,NEW.lot,'complete',json_extract(NEW.created_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_folder_edit AFTER UPDATE OF revision ON survey_folders WHEN NEW.revision<>OLD.revision AND NEW.updated_by IS NOT NULL BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'folder:edit:'||NEW.id||':'||NEW.revision,json_extract(NEW.updated_by,'$.id'),json_extract(NEW.updated_by,'$.name'),COALESCE(json_extract(NEW.updated_by,'$.activity'),'folder.updated'),'folder',NEW.id,NEW.id,NEW.lot,'complete',json_extract(NEW.updated_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_folder_delete AFTER UPDATE OF deleting ON survey_folders WHEN OLD.deleting=0 AND NEW.deleting=1 AND NEW.deleted_by IS NOT NULL BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'folder:delete:'||NEW.id,json_extract(NEW.deleted_by,'$.id'),json_extract(NEW.deleted_by,'$.name'),'folder.deleted','folder',NEW.id,NEW.id,NEW.lot,'pending',json_extract(NEW.deleted_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_photo_deleted AFTER DELETE ON photos BEGIN UPDATE activity_log SET status='complete' WHERE owner=OLD.owner AND id='photo:delete:'||OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER activity_folder_deleted AFTER DELETE ON survey_folders BEGIN UPDATE activity_log SET status='complete' WHERE owner=OLD.owner AND id='folder:delete:'||OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER activity_drawing_add AFTER INSERT ON drawing_drafts WHEN NEW.updated_by IS NOT NULL AND NEW.restored=0 BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'drawing:save:'||NEW.photo_id||':'||NEW.revision,json_extract(NEW.updated_by,'$.id'),json_extract(NEW.updated_by,'$.name'),'drawing.saved','drawing',NEW.photo_id,(SELECT folder FROM photos WHERE id=NEW.photo_id),'도면 저장','complete',json_extract(NEW.updated_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_drawing_edit AFTER UPDATE OF revision ON drawing_drafts WHEN NEW.revision<>OLD.revision AND NEW.updated_by IS NOT NULL BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'drawing:save:'||NEW.photo_id||':'||NEW.revision,json_extract(NEW.updated_by,'$.id'),json_extract(NEW.updated_by,'$.name'),'drawing.saved','drawing',NEW.photo_id,(SELECT folder FROM photos WHERE id=NEW.photo_id),'도면 저장','complete',json_extract(NEW.updated_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_source_add AFTER INSERT ON schedule_imports WHEN NEW.created_by IS NOT NULL AND NEW.restored=0 BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'source:add:'||NEW.id,json_extract(NEW.created_by,'$.id'),json_extract(NEW.created_by,'$.name'),'schedule.imported','schedule',NEW.id,NULL,NEW.filename,'complete',json_extract(NEW.created_by,'$.at')); END;
