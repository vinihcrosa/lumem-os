CREATE TABLE `task_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text DEFAULT 'human' NOT NULL,
	`created_by_session` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_comment_created_by" CHECK("task_comment"."created_by" IN ('human', 'agent')),
	CONSTRAINT "task_comment_provenance" CHECK(("task_comment"."created_by" = 'agent' AND "task_comment"."created_by_session" IS NOT NULL)
        OR ("task_comment"."created_by" = 'human' AND "task_comment"."created_by_session" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `task_comment_by_task` ON `task_comment` (`task_id`,`created_at`);