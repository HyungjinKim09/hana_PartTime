ALTER TABLE survey_folders ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE schedule_imports ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE folder_seed_state (owner TEXT PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO folder_seed_state (owner) SELECT DISTINCT owner FROM survey_folders;
--> statement-breakpoint
CREATE TRIGGER photos_require_active_folder BEFORE INSERT ON photos
WHEN NOT EXISTS (SELECT 1 FROM survey_folders WHERE owner=NEW.owner AND id=NEW.folder AND deleting=0)
BEGIN SELECT RAISE(ABORT, 'Folder is missing or being deleted'); END;
