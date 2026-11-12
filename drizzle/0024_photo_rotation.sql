ALTER TABLE photos ADD COLUMN version TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TRIGGER folder_photo_replace AFTER UPDATE OF version ON photos
WHEN NEW.kind='photo' AND NEW.deleted=0 AND NEW.version<>OLD.version
BEGIN
 UPDATE survey_folders SET photo_revision=photo_revision+1 WHERE owner=NEW.owner AND id=NEW.folder;
END;
