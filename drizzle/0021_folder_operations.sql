ALTER TABLE survey_folders ADD COLUMN assigned_participants TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN assigned_participants_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN participants_revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN photo_revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN download_photo_revision INTEGER;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN downloaded_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN download_updated_by TEXT;
--> statement-breakpoint
ALTER TABLE survey_folders ADD COLUMN download_revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE archive_completion_receipts(owner TEXT NOT NULL,id TEXT NOT NULL,folder_photos TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(owner,id));
--> statement-breakpoint
CREATE INDEX archive_completion_expiry ON archive_completion_receipts(owner,expires_at);
--> statement-breakpoint
CREATE TRIGGER folder_photo_insert AFTER INSERT ON photos WHEN NEW.kind='photo' AND NEW.deleted=0 BEGIN UPDATE survey_folders SET photo_revision=photo_revision+1 WHERE owner=NEW.owner AND id=NEW.folder; END;
--> statement-breakpoint
CREATE TRIGGER folder_photo_delete AFTER DELETE ON photos WHEN OLD.kind='photo' AND OLD.deleted=0 BEGIN UPDATE survey_folders SET photo_revision=photo_revision+1 WHERE owner=OLD.owner AND id=OLD.folder; END;
--> statement-breakpoint
CREATE TRIGGER folder_photo_visibility AFTER UPDATE OF deleted ON photos WHEN NEW.kind='photo' AND OLD.deleted<>NEW.deleted BEGIN UPDATE survey_folders SET photo_revision=photo_revision+1 WHERE owner=NEW.owner AND id=NEW.folder; END;
--> statement-breakpoint
CREATE TRIGGER activity_assigned_participants AFTER UPDATE OF assigned_participants_by ON survey_folders WHEN NEW.assigned_participants_by IS NOT NULL AND COALESCE(json_extract(NEW.assigned_participants_by,'$.restored'),0)=0 BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'folder:participants:'||NEW.id||':'||NEW.participants_revision,json_extract(NEW.assigned_participants_by,'$.id'),json_extract(NEW.assigned_participants_by,'$.name'),'folder.participants','folder',NEW.id,NEW.id,NEW.lot,'complete',json_extract(NEW.assigned_participants_by,'$.at')); END;
--> statement-breakpoint
CREATE TRIGGER activity_download_status AFTER UPDATE OF download_updated_by ON survey_folders WHEN NEW.download_updated_by IS NOT NULL AND COALESCE(json_extract(NEW.download_updated_by,'$.restored'),0)=0 BEGIN INSERT OR IGNORE INTO activity_log(owner,id,actor_id,actor_name,action,target_type,target_id,folder_id,label,status,created_at) VALUES(NEW.owner,'folder:download:'||NEW.id||':'||NEW.download_revision,json_extract(NEW.download_updated_by,'$.id'),json_extract(NEW.download_updated_by,'$.name'),CASE WHEN NEW.downloaded_by IS NULL THEN 'photos.download_cleared' ELSE 'photos.download_confirmed' END,'folder',NEW.id,NEW.id,NEW.lot,'complete',json_extract(NEW.download_updated_by,'$.at')); END;
