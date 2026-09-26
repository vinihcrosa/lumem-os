PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_lumem_mode` text DEFAULT 'ask' NOT NULL,
	`budget_cost_per_task` real,
	`budget_cost_per_day` real,
	`budget_turns_per_session` integer,
	`autonomy` text DEFAULT 'manual' NOT NULL,
	`autonomy_max_parallel` integer DEFAULT 2 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "workspace_default_lumem_mode" CHECK("__new_workspace"."default_lumem_mode" IN ('ask', 'auto')),
	CONSTRAINT "workspace_autonomy" CHECK("__new_workspace"."autonomy" IN ('manual', 'assistido', 'autonomo')),
	CONSTRAINT "workspace_autonomy_max_parallel" CHECK("__new_workspace"."autonomy_max_parallel" >= 0),
	CONSTRAINT "workspace_budget_not_negative" CHECK(("__new_workspace"."budget_cost_per_task" IS NULL OR "__new_workspace"."budget_cost_per_task" >= 0)
        AND ("__new_workspace"."budget_cost_per_day" IS NULL OR "__new_workspace"."budget_cost_per_day" >= 0)
        AND ("__new_workspace"."budget_turns_per_session" IS NULL OR "__new_workspace"."budget_turns_per_session" >= 0))
);
--> statement-breakpoint
-- Reescrita à mão pela QUARTA vez: o `drizzle-kit` gera o SELECT com as colunas
-- da tabela nova lendo da velha, e `SELECT "autonomy" FROM workspace` não existe
-- num banco anterior a esta migração. O `0001`, o `0018` e o `0020` pagaram pelo
-- mesmo. Copia-se o que havia; as duas novas ficam no DEFAULT — `manual`, que é
-- o Lumem de hoje, e `2`, que é o número que a folha do Open Design desenha.
INSERT INTO `__new_workspace`("id", "name", "default_lumem_mode", "budget_cost_per_task", "budget_cost_per_day", "budget_turns_per_session", "created_at", "updated_at") SELECT "id", "name", "default_lumem_mode", "budget_cost_per_task", "budget_cost_per_day", "budget_turns_per_session", "created_at", "updated_at" FROM `workspace`;--> statement-breakpoint
DROP TABLE `workspace`;--> statement-breakpoint
ALTER TABLE `__new_workspace` RENAME TO `workspace`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_name_unique` ON `workspace` (`name`);