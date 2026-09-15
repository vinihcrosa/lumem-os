ALTER TABLE `session` ADD `task_role` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text DEFAULT 'human' NOT NULL,
	`created_by_session` text,
	`worktree_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`reason` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`bounces` integer DEFAULT 0 NOT NULL,
	`autonomy` text DEFAULT 'inherit' NOT NULL,
	`prepared_prompt` text,
	`prepared_role` text,
	`blocked_reason` text,
	`notified_at` integer,
	`external_source` text,
	`external_id` text,
	`external_state` text,
	`external_assignee` text,
	`external_body_hash` text,
	`external_marks` text DEFAULT '[]' NOT NULL,
	`status_changed_at` integer DEFAULT 0 NOT NULL,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`worktree_id`) REFERENCES `worktree`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "task_status" CHECK("__new_task"."status" IN ('proposed', 'backlog', 'open', 'in_progress', 'review', 'testing', 'ready_to_merge', 'done', 'dropped')),
	CONSTRAINT "task_created_by" CHECK("__new_task"."created_by" IN ('human', 'agent')),
	CONSTRAINT "task_autonomy" CHECK("__new_task"."autonomy" IN ('inherit', 'off')),
	CONSTRAINT "task_attempts_not_negative" CHECK("__new_task"."attempts" >= 0),
	CONSTRAINT "task_bounces_not_negative" CHECK("__new_task"."bounces" >= 0),
	CONSTRAINT "task_prepared_pair" CHECK(("__new_task"."prepared_prompt" IS NULL AND "__new_task"."prepared_role" IS NULL)
        OR ("__new_task"."prepared_prompt" IS NOT NULL AND "__new_task"."prepared_role" IS NOT NULL)),
	CONSTRAINT "task_agent_provenance" CHECK(("__new_task"."created_by" = 'agent' AND "__new_task"."created_by_session" IS NOT NULL)
        OR ("__new_task"."created_by" = 'human' AND "__new_task"."created_by_session" IS NULL)),
	CONSTRAINT "task_closed_at" CHECK(("__new_task"."status" IN ('done', 'dropped') AND "__new_task"."closed_at" IS NOT NULL)
        OR ("__new_task"."status" NOT IN ('done', 'dropped') AND "__new_task"."closed_at" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_task`("id", "workspace_id", "project_id", "title", "body", "status", "created_by", "created_by_session", "worktree_id", "position", "links", "reason", "attempts", "bounces", "autonomy", "prepared_prompt", "prepared_role", "blocked_reason", "notified_at", "external_source", "external_id", "external_state", "external_assignee", "external_body_hash", "external_marks", "status_changed_at", "closed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "project_id", "title", "body", "status", "created_by", "created_by_session", "worktree_id", "position", "links", "reason", "attempts", 0, "autonomy", "prepared_prompt", "prepared_role", "blocked_reason", "notified_at", "external_source", "external_id", "external_state", "external_assignee", "external_body_hash", "external_marks", "status_changed_at", "closed_at", "created_at", "updated_at" FROM `task`;--> statement-breakpoint
DROP TABLE `task`;--> statement-breakpoint
ALTER TABLE `__new_task` RENAME TO `task`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `task_by_workspace` ON `task` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `task_by_position` ON `task` (`workspace_id`,`status`,`position`);--> statement-breakpoint
CREATE INDEX `task_by_project` ON `task` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_external_in_workspace` ON `task` (`workspace_id`,`external_source`,`external_id`);