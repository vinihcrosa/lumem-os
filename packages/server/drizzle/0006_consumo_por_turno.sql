CREATE TABLE `session_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`project_id` text NOT NULL,
	`worktree_id` text DEFAULT '' NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`cost` real,
	`currency` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "session_usage_tokens" CHECK("session_usage"."tokens" >= 0)
);
--> statement-breakpoint
CREATE INDEX `session_usage_project_at` ON `session_usage` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `session_usage_worktree_at` ON `session_usage` (`worktree_id`,`created_at`);