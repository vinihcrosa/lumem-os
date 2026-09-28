ALTER TABLE `task` ADD `quota_refusals` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `paused_until` integer;