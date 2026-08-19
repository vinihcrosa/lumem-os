--> The pragma below is inert, and it is left exactly as drizzle-kit emits it so
--> that regenerating this file produces no diff. SQLite ignores
--> `foreign_keys` inside a transaction, which is where the migrator runs it, so
--> the rebuild's `DROP TABLE agent_config` used to fail on any database with a
--> session attached to a configuration. The pragma that actually matters is set
--> before the transaction opens, in `openDatabase` — see the note there.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_config` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`command` text NOT NULL,
	`args` text DEFAULT '[]' NOT NULL,
	`env` text DEFAULT '{}' NOT NULL,
	`transport` text DEFAULT 'pty' NOT NULL,
	`adapter_version` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "agent_config_transport" CHECK("__new_agent_config"."transport" IN ('pty', 'acp')),
	CONSTRAINT "agent_config_adapter_version" CHECK(("__new_agent_config"."transport" = 'acp' AND "__new_agent_config"."adapter_version" IS NOT NULL)
        OR ("__new_agent_config"."transport" = 'pty' AND "__new_agent_config"."adapter_version" IS NULL))
);
--> statement-breakpoint
--> Written by hand, and this is the reason: drizzle-kit generated
--> `SELECT "transport", "adapter_version" FROM agent_config`, reading the two
--> columns this very migration is adding. The table being copied FROM does not
--> have them, so the statement fails with `no such column: "transport"` on any
--> database that is actually being upgraded. It passes on an empty one, because
--> there is nothing to copy — which is why only `migrations.test.ts` caught it.
--> The literals below are A11 in SQL: everything that already worked was a PTY
--> configuration, and it stays one.
INSERT INTO `__new_agent_config`("id", "name", "command", "args", "env", "transport", "adapter_version", "created_at", "updated_at") SELECT "id", "name", "command", "args", "env", 'pty', NULL, "created_at", "updated_at" FROM `agent_config`;--> statement-breakpoint
DROP TABLE `agent_config`;--> statement-breakpoint
ALTER TABLE `__new_agent_config` RENAME TO `agent_config`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_config_name_unique` ON `agent_config` (`name`);--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`agent_config_id` text,
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
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`agent_config_id`) REFERENCES `agent_config`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "session_kind" CHECK("__new_session"."kind" IN ('shell', 'agent')),
	CONSTRAINT "session_scope_type" CHECK("__new_session"."scope_type" IN ('project', 'worktree')),
	CONSTRAINT "session_state" CHECK("__new_session"."state" IN ('running', 'exited')),
	CONSTRAINT "session_agent_config" CHECK(("__new_session"."kind" = 'agent' AND "__new_session"."agent_config_id" IS NOT NULL)
        OR ("__new_session"."kind" = 'shell' AND "__new_session"."agent_config_id" IS NULL)),
	CONSTRAINT "session_exit_code" CHECK(("__new_session"."state" = 'running' AND "__new_session"."exit_code" IS NULL)
        OR ("__new_session"."state" = 'exited')),
	CONSTRAINT "session_transport" CHECK("__new_session"."transport" IN ('pty', 'acp')),
	CONSTRAINT "session_shell_transport" CHECK("__new_session"."kind" = 'agent' OR "__new_session"."transport" = 'pty'),
	CONSTRAINT "session_acp_id" CHECK(("__new_session"."transport" = 'acp' AND "__new_session"."acp_session_id" IS NOT NULL)
        OR ("__new_session"."transport" = 'pty' AND "__new_session"."acp_session_id" IS NULL))
);
--> statement-breakpoint
--> Same correction, same reason. Every session that exists is a PTY session
--> with no conversation attached, so `mode` and `model` are unknown rather than
--> guessed — the adapter is the only thing that can report them.
INSERT INTO `__new_session`("id", "kind", "agent_config_id", "scope_type", "scope_id", "cwd", "command", "state", "exit_code", "transport", "acp_session_id", "mode", "model", "created_at", "updated_at") SELECT "id", "kind", "agent_config_id", "scope_type", "scope_id", "cwd", "command", "state", "exit_code", 'pty', NULL, NULL, NULL, "created_at", "updated_at" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;