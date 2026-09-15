ALTER TABLE `task` ADD `external_source` text;--> statement-breakpoint
ALTER TABLE `task` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `task` ADD `external_state` text;--> statement-breakpoint
ALTER TABLE `task` ADD `external_assignee` text;--> statement-breakpoint
ALTER TABLE `task` ADD `external_body_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `task_external_in_workspace` ON `task` (`workspace_id`,`external_source`,`external_id`);