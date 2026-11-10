-- Cover the active gallery predicates, including the tie-breaker used by cursors.
CREATE INDEX photos_active_folder_page ON photos(owner,folder,created_at DESC,id DESC) WHERE deleted=0;
--> statement-breakpoint
CREATE INDEX photos_active_folder_kind_page ON photos(owner,folder,kind,created_at DESC,id DESC) WHERE deleted=0;
--> statement-breakpoint
-- Expired login buckets must not require scanning all active IP/window buckets.
CREATE INDEX site_login_limits_expiry ON site_login_limits(expires_at);
--> statement-breakpoint
-- A rolling operation reservation must not read older months of usage.
CREATE INDEX r2_operation_usage_kind_day ON r2_operation_usage(kind,day,amount);
