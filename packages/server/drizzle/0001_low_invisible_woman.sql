CREATE TABLE `memory_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL,
	`slug` text NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`source_actor` text NOT NULL,
	`confidence` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "memory_entry_type" CHECK("memory_entry"."type" IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')),
	CONSTRAINT "memory_entry_scope" CHECK("memory_entry"."scope" IN ('global', 'workspace', 'project'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_entry_path_unique` ON `memory_entry` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `memory_entry_identity` ON `memory_entry` (`scope`,`workspace_id`,`project_id`,`type`,`slug`);