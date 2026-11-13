ALTER TABLE survey_folders ADD COLUMN schedule_team INTEGER CHECK(schedule_team BETWEEN 1 AND 20);
