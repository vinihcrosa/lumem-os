CREATE TABLE `memory_signal` (
	`path` text PRIMARY KEY NOT NULL,
	`recall_count` integer DEFAULT 0 NOT NULL,
	`last_recalled_at` integer,
	`best_score` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`session_id` text,
	`workspace_id` text,
	`project_id` text,
	`amount` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
