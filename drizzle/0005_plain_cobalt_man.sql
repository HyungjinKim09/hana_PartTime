CREATE TABLE `site_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`username` text NOT NULL,
	`salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`expires_at` integer NOT NULL
);
