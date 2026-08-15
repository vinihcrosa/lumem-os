CREATE TABLE `agent_config` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`command` text NOT NULL,
	`args` text DEFAULT '[]' NOT NULL,
	`env` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_config_name_unique` ON `agent_config` (`name`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`default_branch` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_path_unique` ON `project` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_name_per_workspace` ON `project` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`agent_config_id` text,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`cwd` text NOT NULL,
	`command` text NOT NULL,
	`state` text DEFAULT 'running' NOT NULL,
	`exit_code` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`agent_config_id`) REFERENCES `agent_config`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "session_kind" CHECK("session"."kind" IN ('shell', 'agent')),
	CONSTRAINT "session_scope_type" CHECK("session"."scope_type" IN ('project', 'worktree')),
	CONSTRAINT "session_state" CHECK("session"."state" IN ('running', 'exited')),
	CONSTRAINT "session_agent_config" CHECK(("session"."kind" = 'agent' AND "session"."agent_config_id" IS NOT NULL)
        OR ("session"."kind" = 'shell' AND "session"."agent_config_id" IS NULL)),
	CONSTRAINT "session_exit_code" CHECK(("session"."state" = 'running' AND "session"."exit_code" IS NULL)
        OR ("session"."state" = 'exited'))
);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_name_unique` ON `workspace` (`name`);--> statement-breakpoint
CREATE TABLE `worktree` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`branch` text NOT NULL,
	`path` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "worktree_state" CHECK("worktree"."state" IN ('active', 'missing'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worktree_name_per_project` ON `worktree` (`project_id`,`name`);