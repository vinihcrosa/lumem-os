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
	`autonomy` text DEFAULT 'inherit' NOT NULL,
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
	CONSTRAINT "task_agent_provenance" CHECK(("__new_task"."created_by" = 'agent' AND "__new_task"."created_by_session" IS NOT NULL)
        OR ("__new_task"."created_by" = 'human' AND "__new_task"."created_by_session" IS NULL)),
	CONSTRAINT "task_closed_at" CHECK(("__new_task"."status" IN ('done', 'dropped') AND "__new_task"."closed_at" IS NOT NULL)
        OR ("__new_task"."status" NOT IN ('done', 'dropped') AND "__new_task"."closed_at" IS NULL))
);
--> statement-breakpoint
-- A lista de colunas foi reescrita à mão, e é a TERCEIRA vez neste repositório:
-- o `drizzle-kit` gera o SELECT com as colunas da tabela **nova**, lendo da
-- **velha** — `SELECT "attempts", "autonomy" FROM task` num banco onde elas, por
-- definição, ainda não existem. O `0001` pagou por isso, o `0018` pagou cinco
-- migrações depois, e a lição já está no `testing.md`: **leia o SELECT de toda
-- migração gerada**. Nenhum teste que começa de banco vazio pega.
--
-- Copia-se o que havia. As duas novas ficam no DEFAULT: `attempts = 0`, que é a
-- verdade sobre toda tarefa que existia antes de a esteira existir, e
-- `autonomy = 'inherit'`, que não liga nada — o interruptor do workspace nasce
-- em `manual`.
INSERT INTO `__new_task`("id", "workspace_id", "project_id", "title", "body", "status", "created_by", "created_by_session", "worktree_id", "position", "links", "reason", "status_changed_at", "closed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "project_id", "title", "body", "status", "created_by", "created_by_session", "worktree_id", "position", "links", "reason", "status_changed_at", "closed_at", "created_at", "updated_at" FROM `task`;--> statement-breakpoint
DROP TABLE `task`;--> statement-breakpoint
ALTER TABLE `__new_task` RENAME TO `task`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `task_by_workspace` ON `task` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `task_by_position` ON `task` (`workspace_id`,`status`,`position`);--> statement-breakpoint
CREATE INDEX `task_by_project` ON `task` (`project_id`);