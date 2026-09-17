CREATE TABLE `schedule_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`draft` text NOT NULL,
	`region` text,
	`survey_date` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedule_imports_owner_day` ON `schedule_imports` (`owner`,`region`,`survey_date`);--> statement-breakpoint
CREATE TABLE `survey_folders` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`region` text NOT NULL,
	`survey_date` text NOT NULL,
	`lot` text NOT NULL,
	`time` text NOT NULL,
	`name` text NOT NULL,
	`phones` text NOT NULL,
	`address` text NOT NULL,
	`notes` text NOT NULL,
	`group_index` integer NOT NULL,
	`sort_index` integer NOT NULL,
	`warning` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `survey_folders_owner_day_lot` ON `survey_folders` (`owner`,`region`,`survey_date`,`lot`);