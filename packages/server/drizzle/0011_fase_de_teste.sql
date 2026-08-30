PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`script_name` text,
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
	`resumed_from_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`agent_config_id`) REFERENCES `agent_config`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "session_kind" CHECK("__new_session"."kind" IN ('shell', 'agent', 'script')),
	CONSTRAINT "session_scope_type" CHECK("__new_session"."scope_type" IN ('project', 'worktree')),
	CONSTRAINT "session_state" CHECK("__new_session"."state" IN ('running', 'exited')),
	CONSTRAINT "session_agent_config" CHECK(("__new_session"."kind" = 'agent' AND "__new_session"."agent_config_id" IS NOT NULL)
        OR ("__new_session"."kind" <> 'agent' AND "__new_session"."agent_config_id" IS NULL)),
	CONSTRAINT "session_script_name" CHECK(("__new_session"."kind" = 'script' AND "__new_session"."script_name" IS NOT NULL
          AND "__new_session"."script_name" IN ('setup', 'run', 'teardown', 'test'))
        OR ("__new_session"."kind" <> 'script' AND "__new_session"."script_name" IS NULL)),
	CONSTRAINT "session_exit_code" CHECK(("__new_session"."state" = 'running' AND "__new_session"."exit_code" IS NULL)
        OR ("__new_session"."state" = 'exited')),
	CONSTRAINT "session_transport" CHECK("__new_session"."transport" IN ('pty', 'acp')),
	CONSTRAINT "session_shell_transport" CHECK("__new_session"."kind" = 'agent' OR "__new_session"."transport" = 'pty'),
	CONSTRAINT "session_acp_id" CHECK(("__new_session"."transport" = 'acp' AND "__new_session"."acp_session_id" IS NOT NULL)
        OR ("__new_session"."transport" = 'pty' AND "__new_session"."acp_session_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "kind", "script_name", "agent_config_id", "scope_type", "scope_id", "cwd", "command", "state", "exit_code", "transport", "acp_session_id", "mode", "model", "resumed_from_id", "created_at", "updated_at") SELECT "id", "kind", "script_name", "agent_config_id", "scope_type", "scope_id", "cwd", "command", "state", "exit_code", "transport", "acp_session_id", "mode", "model", "resumed_from_id", "created_at", "updated_at" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;