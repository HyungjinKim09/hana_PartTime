CREATE TABLE personal_survey_records(owner TEXT NOT NULL,folder_id TEXT NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,remarks TEXT NOT NULL,building_details TEXT NOT NULL,survey_status TEXT NOT NULL,updated_at TEXT NOT NULL,restored INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,folder_id,actor_id));
--> statement-breakpoint
CREATE INDEX personal_records_actor ON personal_survey_records(owner,actor_id,folder_id);
--> statement-breakpoint
CREATE INDEX activity_participation ON activity_log(owner,actor_id,action,status,folder_id,created_at);
--> statement-breakpoint
INSERT INTO personal_survey_records(owner,folder_id,actor_id,actor_name,remarks,building_details,survey_status,updated_at) SELECT owner,id,json_extract(survey_updated_by,'$.id'),json_extract(survey_updated_by,'$.name'),remarks,building_details,survey_status,json_extract(survey_updated_by,'$.at') FROM survey_folders WHERE deleting=0 AND survey_updated_by IS NOT NULL AND COALESCE(json_extract(survey_updated_by,'$.restored'),0)=0;
--> statement-breakpoint
CREATE TRIGGER personal_survey_save AFTER UPDATE OF survey_updated_by ON survey_folders WHEN NEW.survey_updated_by IS NOT NULL BEGIN INSERT INTO personal_survey_records(owner,folder_id,actor_id,actor_name,remarks,building_details,survey_status,updated_at) VALUES(NEW.owner,NEW.id,json_extract(NEW.survey_updated_by,'$.id'),json_extract(NEW.survey_updated_by,'$.name'),NEW.remarks,NEW.building_details,NEW.survey_status,json_extract(NEW.survey_updated_by,'$.at')) ON CONFLICT(owner,folder_id,actor_id) DO UPDATE SET actor_name=excluded.actor_name,remarks=excluded.remarks,building_details=excluded.building_details,survey_status=excluded.survey_status,updated_at=excluded.updated_at,restored=0; END;
--> statement-breakpoint
CREATE TRIGGER personal_survey_delete AFTER DELETE ON survey_folders BEGIN DELETE FROM personal_survey_records WHERE owner=OLD.owner AND folder_id=OLD.id; END;
--> statement-breakpoint
ALTER TABLE restore_jobs ADD COLUMN personal_surveys INTEGER;
