CREATE TABLE `memory_access` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`from_project_id` text,
	`target_project_id` text,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "memory_access_kind" CHECK("memory_access"."kind" IN ('memory', 'repository')),
	CONSTRAINT "memory_access_decision" CHECK("memory_access"."decision" IN ('allowed', 'denied'))
);
