ALTER TABLE `survey_folders` ADD `manual_added` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `survey_folders` ADD `unit_display` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Native manually created folders have UUIDs and no matching source schedule row.
-- Seed folders use their original lot IDs. Preserve imported schedules as regular rows.
UPDATE survey_folders SET manual_added=1, unit_display=unit
WHERE length(id)=36 AND NOT EXISTS (
 SELECT 1 FROM schedule_imports s, json_each(s.draft,'$.folders') row
 WHERE s.owner=survey_folders.owner AND s.region=survey_folders.region
 AND s.survey_date=survey_folders.survey_date
 AND json_extract(row.value,'$.lot')=survey_folders.lot
 AND COALESCE(json_extract(row.value,'$.unit'),'')=survey_folders.unit
);
