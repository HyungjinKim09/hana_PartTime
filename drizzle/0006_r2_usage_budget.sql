CREATE TABLE r2_storage_usage (id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL CHECK(bytes>=0));
--> statement-breakpoint
INSERT INTO r2_storage_usage (id,bytes) VALUES (1,0);
--> statement-breakpoint
CREATE TABLE r2_object_usage (object_key TEXT PRIMARY KEY NOT NULL, size INTEGER NOT NULL CHECK(size>=0));
--> statement-breakpoint
CREATE TRIGGER r2_object_insert AFTER INSERT ON r2_object_usage BEGIN
  UPDATE r2_storage_usage SET bytes=bytes+NEW.size WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER r2_object_delete AFTER DELETE ON r2_object_usage BEGIN
  UPDATE r2_storage_usage SET bytes=bytes-OLD.size WHERE id=1;
END;
--> statement-breakpoint
INSERT INTO r2_object_usage (object_key,size)
SELECT object_key,MAX(size) FROM (
  SELECT object_key,size FROM photos
  UNION ALL SELECT object_key,size FROM schedule_imports
) GROUP BY object_key;
--> statement-breakpoint
CREATE TABLE r2_operation_usage (
  day TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('read','write')),
  amount INTEGER NOT NULL CHECK(amount>=0), PRIMARY KEY(day,kind)
);
