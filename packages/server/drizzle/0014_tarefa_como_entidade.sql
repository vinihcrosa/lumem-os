CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text DEFAULT 'human' NOT NULL,
	`created_by_session` text,
	`worktree_id` text,
	`links` text DEFAULT '[]' NOT NULL,
	`reason` text,
	`closed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`worktree_id`) REFERENCES `worktree`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "task_status" CHECK("task"."status" IN ('proposed', 'open', 'in_progress', 'review', 'done', 'dropped')),
	CONSTRAINT "task_created_by" CHECK("task"."created_by" IN ('human', 'agent')),
	CONSTRAINT "task_agent_provenance" CHECK(("task"."created_by" = 'agent' AND "task"."created_by_session" IS NOT NULL)
        OR ("task"."created_by" = 'human' AND "task"."created_by_session" IS NULL)),
	CONSTRAINT "task_closed_at" CHECK(("task"."status" IN ('done', 'dropped') AND "task"."closed_at" IS NOT NULL)
        OR ("task"."status" NOT IN ('done', 'dropped') AND "task"."closed_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `task_by_workspace` ON `task` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `task_by_project` ON `task` (`project_id`);--> statement-breakpoint
-- `ON DELETE set null` escrito à mão: o `drizzle-kit` perde a ação do FK no
-- caminho de ALTER TABLE, e sem ela a coluna nasceria NO ACTION — ou seja,
-- apagar uma tarefa ficaria bloqueado por qualquer sessão que a serviu, que é
-- o oposto do que o schema declara.
ALTER TABLE `session` ADD `task_id` text REFERENCES `task`(`id`) ON UPDATE no action ON DELETE set null;