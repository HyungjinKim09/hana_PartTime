CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id=1),storage_limit INTEGER NOT NULL DEFAULT 8000000000 CHECK(storage_limit>0));
--> statement-breakpoint
INSERT INTO app_settings(id) VALUES(1);
--> statement-breakpoint
CREATE TABLE folder_stats(owner TEXT NOT NULL,folder TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,photo_count INTEGER NOT NULL DEFAULT 0,photo_bytes INTEGER NOT NULL DEFAULT 0,drawing_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,folder));
--> statement-breakpoint
INSERT INTO folder_stats(owner,folder,count,bytes,photo_count,photo_bytes,drawing_count) SELECT owner,folder,COUNT(*),SUM(size),SUM(kind='photo'),SUM(CASE WHEN kind='photo' THEN size ELSE 0 END),SUM(kind='drawing') FROM photos WHERE deleted=0 GROUP BY owner,folder;
--> statement-breakpoint
CREATE TRIGGER photo_stats_insert AFTER INSERT ON photos WHEN NEW.deleted=0 BEGIN
 INSERT INTO folder_stats(owner,folder,count,bytes,photo_count,photo_bytes,drawing_count) VALUES(NEW.owner,NEW.folder,1,NEW.size,NEW.kind='photo',CASE WHEN NEW.kind='photo' THEN NEW.size ELSE 0 END,NEW.kind='drawing') ON CONFLICT(owner,folder) DO UPDATE SET count=count+1,bytes=bytes+excluded.bytes,photo_count=photo_count+excluded.photo_count,photo_bytes=photo_bytes+excluded.photo_bytes,drawing_count=drawing_count+excluded.drawing_count;
END;
--> statement-breakpoint
CREATE TRIGGER photo_stats_delete AFTER DELETE ON photos WHEN OLD.deleted=0 BEGIN
 UPDATE folder_stats SET count=count-1,bytes=bytes-OLD.size,photo_count=photo_count-(OLD.kind='photo'),photo_bytes=photo_bytes-CASE WHEN OLD.kind='photo' THEN OLD.size ELSE 0 END,drawing_count=drawing_count-(OLD.kind='drawing') WHERE owner=OLD.owner AND folder=OLD.folder;
END;
--> statement-breakpoint
CREATE TRIGGER photo_stats_update AFTER UPDATE OF owner,folder,size,kind,deleted ON photos BEGIN
 UPDATE folder_stats SET count=count-1,bytes=bytes-OLD.size,photo_count=photo_count-(OLD.kind='photo'),photo_bytes=photo_bytes-CASE WHEN OLD.kind='photo' THEN OLD.size ELSE 0 END,drawing_count=drawing_count-(OLD.kind='drawing') WHERE owner=OLD.owner AND folder=OLD.folder AND OLD.deleted=0;
 INSERT INTO folder_stats(owner,folder,count,bytes,photo_count,photo_bytes,drawing_count) SELECT NEW.owner,NEW.folder,1,NEW.size,NEW.kind='photo',CASE WHEN NEW.kind='photo' THEN NEW.size ELSE 0 END,NEW.kind='drawing' WHERE NEW.deleted=0 ON CONFLICT(owner,folder) DO UPDATE SET count=count+1,bytes=bytes+excluded.bytes,photo_count=photo_count+excluded.photo_count,photo_bytes=photo_bytes+excluded.photo_bytes,drawing_count=drawing_count+excluded.drawing_count;
END;
--> statement-breakpoint
CREATE TRIGGER folder_stats_delete AFTER DELETE ON survey_folders BEGIN DELETE FROM folder_stats WHERE owner=OLD.owner AND folder=OLD.id; END;
--> statement-breakpoint
CREATE INDEX photos_owner_created ON photos(owner,created_at);
