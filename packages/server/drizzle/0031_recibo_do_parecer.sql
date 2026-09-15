CREATE TABLE `task_review` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`by_session` text NOT NULL,
	`role` text NOT NULL,
	`blocks` integer DEFAULT 0 NOT NULL,
	`notes` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_review_counts_not_negative" CHECK("task_review"."blocks" >= 0 AND "task_review"."notes" >= 0)
);
--> statement-breakpoint
CREATE INDEX `task_review_by_session` ON `task_review` (`by_session`,`created_at`);