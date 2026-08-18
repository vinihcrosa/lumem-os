CREATE TABLE `action_signal` (
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
	CONSTRAINT "action_signal_kind" CHECK("action_signal"."kind" IN (
        'user_edited_after_agent',
        'user_reverted_agent_commit',
        'worktree_discarded',
        'session_killed_early'
      )),
	CONSTRAINT "action_signal_detail_number" CHECK("action_signal"."detail" IS NULL OR typeof("action_signal"."detail") = 'integer'),
	CONSTRAINT "action_signal_target_shape" CHECK(length("action_signal"."target") BETWEEN 1 AND 1024
        AND instr("action_signal"."target", char(10)) = 0)
);
