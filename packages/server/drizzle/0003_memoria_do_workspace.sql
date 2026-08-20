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
--> statement-breakpoint
CREATE TABLE `memory_access` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`from_project_id` text,
	`target_project_id` text,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "memory_access_kind" CHECK("memory_access"."kind" IN ('memory', 'repository')),
	CONSTRAINT "memory_access_decision" CHECK("memory_access"."decision" IN ('allowed', 'denied'))
);
--> statement-breakpoint
CREATE TABLE `memory_decision` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`path` text NOT NULL,
	`operation` text NOT NULL,
	`outcome` text NOT NULL,
	`actor` text NOT NULL,
	`confidence` text NOT NULL,
	`candidate_hash` text NOT NULL,
	`rule_trace` text DEFAULT '[]' NOT NULL,
	`source_sessions` text DEFAULT '[]' NOT NULL,
	`reason` text,
	`commit_sha` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "memory_decision_operation" CHECK("memory_decision"."operation" IN ('add', 'update', 'delete')),
	CONSTRAINT "memory_decision_outcome" CHECK("memory_decision"."outcome" IN ('applied', 'noop', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_decision_idempotency_key_unique` ON `memory_decision` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `memory_entry` (
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
	CONSTRAINT "memory_entry_type" CHECK("memory_entry"."type" IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')),
	CONSTRAINT "memory_entry_scope" CHECK("memory_entry"."scope" IN ('global', 'workspace', 'project'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_entry_path_unique` ON `memory_entry` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `memory_entry_identity` ON `memory_entry` (`scope`,`workspace_id`,`project_id`,`type`,`slug`);--> statement-breakpoint
CREATE TABLE `memory_proposal` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL,
	`slug` text NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`from_project_id` text,
	`session_id` text,
	`confidence` text NOT NULL,
	`evidence` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_at` integer,
	`resolution_note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "memory_proposal_status" CHECK("memory_proposal"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "memory_proposal_type" CHECK("memory_proposal"."type" IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')),
	CONSTRAINT "memory_proposal_scope" CHECK("memory_proposal"."scope" IN ('global', 'workspace', 'project')),
	CONSTRAINT "memory_proposal_actor" CHECK("memory_proposal"."actor" IN ('human', 'agent', 'distiller', 'auto_research', 'import')),
	CONSTRAINT "memory_proposal_confidence" CHECK("memory_proposal"."confidence" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE `memory_signal` (
	`path` text PRIMARY KEY NOT NULL,
	`recall_count` integer DEFAULT 0 NOT NULL,
	`last_recalled_at` integer,
	`best_score` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`session_id` text,
	`workspace_id` text,
	`project_id` text,
	`amount` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
