CREATE TABLE `named_agent` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`adapter` text NOT NULL,
	`model` text,
	`instructions` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `named_agent_name_in_workspace` ON `named_agent` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `role_binding` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`role` text NOT NULL,
	`agent_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `named_agent`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "role_binding_scope_type" CHECK("role_binding"."scope_type" IN ('workspace', 'project', 'task')),
	CONSTRAINT "role_binding_role" CHECK("role_binding"."role" IN ('implementador', 'revisor', 'testador'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_binding_one_per_scope` ON `role_binding` (`scope_type`,`scope_id`,`role`);