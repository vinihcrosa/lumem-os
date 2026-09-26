CREATE TABLE `agent_account` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_config_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'subscription' NOT NULL,
	`config_dir` text,
	`identity` text,
	`default_model` text,
	`default_effort` text,
	`state` text DEFAULT 'connected' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`agent_config_id`) REFERENCES `agent_config`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agent_account_kind" CHECK("agent_account"."kind" IN ('subscription', 'api_key')),
	CONSTRAINT "agent_account_state" CHECK("agent_account"."state" IN ('connected', 'disconnected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_account_config_dir` ON `agent_account` (`config_dir`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_account_one_bare_per_agent` ON `agent_account` (`agent_config_id`) WHERE config_dir IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_account_label_per_agent` ON `agent_account` (`agent_config_id`,`label`);--> statement-breakpoint
-- Escrito à mão (`034` T4): a conta que já existia. Uma por configuração, com
-- `config_dir` nulo — a que sobe sem a variável, e por isso ninguém reloga —, o
-- nome do agente como rótulo, e marcada padrão. Inclusive a aposentada: a sessão
-- PTY de ontem aponta para ela, e a CHECK estendida exige conta nas duas.
ALTER TABLE `agent_config` ADD `default_account_id` text;--> statement-breakpoint
INSERT INTO `agent_account`("id", "agent_config_id", "label") SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), "id", "name" FROM `agent_config`;--> statement-breakpoint
UPDATE `agent_config` SET "default_account_id" = (SELECT "id" FROM `agent_account` WHERE `agent_account`."agent_config_id" = `agent_config`."id");--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`script_name` text,
	`agent_config_id` text,
	`agent_account_id` text,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`cwd` text NOT NULL,
	`command` text NOT NULL,
	`state` text DEFAULT 'running' NOT NULL,
	`exit_code` integer,
	`transport` text DEFAULT 'pty' NOT NULL,
	`acp_session_id` text,
	`mode` text,
	`model` text,
	`lumem_mode` text DEFAULT 'ask' NOT NULL,
	`resumed_from_id` text,
	`task_id` text,
	`task_role` text,
	`pending_prompt` text,
	`pending_reason` text,
	`pending_detail` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`agent_config_id`) REFERENCES `agent_config`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`agent_account_id`) REFERENCES `agent_account`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "session_kind" CHECK("__new_session"."kind" IN ('shell', 'agent', 'script')),
	CONSTRAINT "session_scope_type" CHECK("__new_session"."scope_type" IN ('project', 'worktree')),
	CONSTRAINT "session_state" CHECK("__new_session"."state" IN ('running', 'exited')),
	CONSTRAINT "session_agent_config" CHECK(("__new_session"."kind" = 'agent' AND "__new_session"."agent_config_id" IS NOT NULL
          AND "__new_session"."agent_account_id" IS NOT NULL)
        OR ("__new_session"."kind" <> 'agent' AND "__new_session"."agent_config_id" IS NULL
          AND "__new_session"."agent_account_id" IS NULL)),
	CONSTRAINT "session_script_name" CHECK(("__new_session"."kind" = 'script' AND "__new_session"."script_name" IS NOT NULL
          AND "__new_session"."script_name" IN ('setup', 'run', 'teardown', 'test'))
        OR ("__new_session"."kind" <> 'script' AND "__new_session"."script_name" IS NULL)),
	CONSTRAINT "session_exit_code" CHECK(("__new_session"."state" = 'running' AND "__new_session"."exit_code" IS NULL)
        OR ("__new_session"."state" = 'exited')),
	CONSTRAINT "session_transport" CHECK("__new_session"."transport" IN ('pty', 'acp')),
	CONSTRAINT "session_shell_transport" CHECK("__new_session"."kind" = 'agent' OR "__new_session"."transport" = 'pty'),
	CONSTRAINT "session_acp_id" CHECK(("__new_session"."transport" = 'acp' AND "__new_session"."acp_session_id" IS NOT NULL)
        OR ("__new_session"."transport" = 'pty' AND "__new_session"."acp_session_id" IS NULL)),
	CONSTRAINT "session_lumem_mode" CHECK("__new_session"."lumem_mode" IN ('ask', 'auto', 'free')),
	CONSTRAINT "session_pending_reason" CHECK("__new_session"."pending_reason" IS NULL OR "__new_session"."pending_reason" IN ('setup_failed'))
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "kind", "script_name", "agent_config_id", "agent_account_id", "scope_type", "scope_id", "cwd", "command", "state", "exit_code", "transport", "acp_session_id", "mode", "model", "lumem_mode", "resumed_from_id", "task_id", "task_role", "pending_prompt", "pending_reason", "pending_detail", "created_at", "updated_at") SELECT "id", "kind", "script_name", "agent_config_id", (SELECT `agent_account`."id" FROM `agent_account` WHERE `agent_account`."agent_config_id" = `session`."agent_config_id"), "scope_type", "scope_id", "cwd", "command", "state", "exit_code", "transport", "acp_session_id", "mode", "model", "lumem_mode", "resumed_from_id", "task_id", "task_role", "pending_prompt", "pending_reason", "pending_detail", "created_at", "updated_at" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `session_usage` ADD `agent_account_id` text;--> statement-breakpoint
-- Escrito à mão: o consumo antigo vai para a conta da sessão que o gastou, e o
-- de uma sessão que já foi apagada, para a conta da configuração dele.
UPDATE `session_usage` SET "agent_account_id" = COALESCE((SELECT `session`."agent_account_id" FROM `session` WHERE `session`."id" = `session_usage`."session_id"), (SELECT `agent_account`."id" FROM `agent_account` WHERE `agent_account`."agent_config_id" = `session_usage`."agent_config_id")) WHERE "agent_config_id" IS NOT NULL;