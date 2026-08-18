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
CREATE UNIQUE INDEX `memory_decision_idempotency_key_unique` ON `memory_decision` (`idempotency_key`);