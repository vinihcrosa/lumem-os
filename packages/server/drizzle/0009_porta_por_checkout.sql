CREATE TABLE `checkout_port` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`port` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "checkout_port_scope_type" CHECK("checkout_port"."scope_type" IN ('project', 'worktree')),
	CONSTRAINT "checkout_port_range" CHECK("checkout_port"."port" > 0 AND "checkout_port"."port" < 65536)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_port_scope` ON `checkout_port` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_port_port` ON `checkout_port` (`port`);