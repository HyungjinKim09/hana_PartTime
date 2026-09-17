DROP INDEX `survey_folders_owner_day_lot`;--> statement-breakpoint
ALTER TABLE `survey_folders` ADD `unit` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `survey_folders_owner_day_lot_unit` ON `survey_folders` (`owner`,`region`,`survey_date`,`lot`,`unit`);