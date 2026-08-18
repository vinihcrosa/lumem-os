PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memory_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL,
	`slug` text NOT NULL,
	`workspace_id` text DEFAULT '' NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`source_actor` text NOT NULL,
	`confidence` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "memory_entry_type" CHECK("__new_memory_entry"."type" IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')),
	CONSTRAINT "memory_entry_scope" CHECK("__new_memory_entry"."scope" IN ('global', 'workspace', 'project'))
);
--> statement-breakpoint
INSERT INTO `__new_memory_entry`("id", "path", "type", "scope", "slug", "workspace_id", "project_id", "name", "description", "source_actor", "confidence", "content_hash", "created_at", "updated_at") SELECT "id", "path", "type", "scope", "slug", coalesce("workspace_id", ''), coalesce("project_id", ''), "name", "description", "source_actor", "confidence", "content_hash", "created_at", "updated_at" FROM `memory_entry`
-- Uma linha por identidade: com as colunas nulas o indice unico nao valia,
-- e o catalogo pode ter duplicata que ele agora proibe. Ele e derivado --
-- `reindex` refaz --, entao colapsar aqui e a migracao que sempre termina.
--
-- Qual linha do grupo sobrevive e **indefinido por construcao**: `id`, `path` e
-- `content_hash` sao colunas nuas num GROUP BY, e a regra do SQLite e escolher
-- de uma linha arbitraria do grupo. Nao ha escolha certa a fazer aqui -- as
-- duplicatas so existem porque o indice nao valia --, e o conserto e `reindex`,
-- que reconstroi o catalogo a partir do disco, que e a fonte da verdade.
GROUP BY "scope", coalesce("workspace_id", ''), coalesce("project_id", ''), "type", "slug";--> statement-breakpoint
DROP TABLE `memory_entry`;--> statement-breakpoint
ALTER TABLE `__new_memory_entry` RENAME TO `memory_entry`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `memory_entry_path_unique` ON `memory_entry` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `memory_entry_identity` ON `memory_entry` (`scope`,`workspace_id`,`project_id`,`type`,`slug`);