CREATE TABLE `playbook` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`scope` text NOT NULL,
	`slug` text NOT NULL,
	`workspace_id` text DEFAULT '' NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`task_class` text NOT NULL,
	`description` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`loads` integer DEFAULT 0 NOT NULL,
	`last_loaded_at` integer,
	`content_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "playbook_scope" CHECK("playbook"."scope" IN ('workspace', 'project'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playbook_path_unique` ON `playbook` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `playbook_identity` ON `playbook` (`scope`,`workspace_id`,`project_id`,`slug`);