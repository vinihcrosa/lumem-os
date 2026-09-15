PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_lumem_mode` text DEFAULT 'ask' NOT NULL,
	`budget_cost_per_task` real,
	`budget_cost_per_day` real,
	`budget_turns_per_session` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "workspace_default_lumem_mode" CHECK("__new_workspace"."default_lumem_mode" IN ('ask', 'auto')),
	CONSTRAINT "workspace_budget_not_negative" CHECK(("__new_workspace"."budget_cost_per_task" IS NULL OR "__new_workspace"."budget_cost_per_task" >= 0)
        AND ("__new_workspace"."budget_cost_per_day" IS NULL OR "__new_workspace"."budget_cost_per_day" >= 0)
        AND ("__new_workspace"."budget_turns_per_session" IS NULL OR "__new_workspace"."budget_turns_per_session" >= 0))
);
--> statement-breakpoint
-- A lista de colunas do SELECT foi reescrita à mão, e é a mesma armadilha que o
-- `0001` pagou: o `drizzle-kit` gera o SELECT com as colunas da tabela **nova**,
-- lendo da **velha** — `SELECT "budget_cost_per_task" FROM workspace` num banco
-- onde essa coluna, por definição, ainda não existe. Copia-se o que havia; as
-- três novas ficam `NULL`, que é o valor que quer dizer **sem teto**.
INSERT INTO `__new_workspace`("id", "name", "default_lumem_mode", "created_at", "updated_at") SELECT "id", "name", "default_lumem_mode", "created_at", "updated_at" FROM `workspace`;--> statement-breakpoint
DROP TABLE `workspace`;--> statement-breakpoint
ALTER TABLE `__new_workspace` RENAME TO `workspace`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_name_unique` ON `workspace` (`name`);
