CREATE TABLE `task_finding` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`found_by_session` text NOT NULL,
	`role` text NOT NULL,
	`bucket` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`command` text,
	`expected` text,
	`verification` text DEFAULT 'pending' NOT NULL,
	`output` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_finding_bucket" CHECK("task_finding"."bucket" IN ('blocks', 'notes')),
	CONSTRAINT "task_finding_verification" CHECK("task_finding"."verification" IN ('pending', 'reproduced', 'refuted', 'skipped')),
	CONSTRAINT "task_finding_reproduction" CHECK(("task_finding"."bucket" = 'blocks' AND "task_finding"."command" IS NOT NULL)
        OR ("task_finding"."bucket" = 'notes' AND "task_finding"."command" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `task_finding_by_task` ON `task_finding` (`task_id`,`created_at`);