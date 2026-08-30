ALTER TABLE `project` ADD `remote_url` text;--> statement-breakpoint
ALTER TABLE `project` ADD `managed` integer DEFAULT false NOT NULL;