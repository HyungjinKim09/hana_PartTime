ALTER TABLE `survey_folders` ADD `remarks` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `survey_folders` ADD `building_details` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `survey_folders` ADD `survey_status` text DEFAULT '미완료' NOT NULL;