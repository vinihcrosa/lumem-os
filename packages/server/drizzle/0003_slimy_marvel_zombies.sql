PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_action_signal` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`worktree_id` text,
	`session_id` text,
	`detail` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "action_signal_kind" CHECK("__new_action_signal"."kind" IN (
        'user_edited_after_agent',
        'user_reverted_agent_commit',
        'worktree_discarded',
        'session_killed_early'
      )),
	CONSTRAINT "action_signal_detail_number" CHECK("__new_action_signal"."detail" IS NULL OR typeof("__new_action_signal"."detail") = 'integer'),
	CONSTRAINT "action_signal_target_shape" CHECK(length("__new_action_signal"."target") BETWEEN 1 AND 1024
        AND instr("__new_action_signal"."target", char(10)) = 0)
);
--> statement-breakpoint
INSERT INTO `__new_action_signal`("id", "kind", "target", "workspace_id", "project_id", "worktree_id", "session_id", "detail", "created_at", "updated_at") SELECT "id", "kind", "target", "workspace_id", "project_id", "worktree_id", "session_id", "detail", "created_at", "updated_at" FROM `action_signal`;--> statement-breakpoint
DROP TABLE `action_signal`;--> statement-breakpoint
ALTER TABLE `__new_action_signal` RENAME TO `action_signal`;--> statement-breakpoint
PRAGMA foreign_keys=ON;