PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memory_proposal` (
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
	CONSTRAINT "memory_proposal_status" CHECK("__new_memory_proposal"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "memory_proposal_type" CHECK("__new_memory_proposal"."type" IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')),
	CONSTRAINT "memory_proposal_scope" CHECK("__new_memory_proposal"."scope" IN ('global', 'workspace', 'project')),
	CONSTRAINT "memory_proposal_actor" CHECK("__new_memory_proposal"."actor" IN ('human', 'agent', 'distiller', 'auto_research', 'import')),
	CONSTRAINT "memory_proposal_confidence" CHECK("__new_memory_proposal"."confidence" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
INSERT INTO `__new_memory_proposal`("id", "path", "type", "scope", "slug", "workspace_id", "project_id", "name", "description", "body", "actor", "from_project_id", "session_id", "confidence", "evidence", "status", "resolved_at", "resolution_note", "created_at", "updated_at") SELECT "id", "path", "type", "scope", "slug", "workspace_id", "project_id", "name", "description", "body", "actor", "from_project_id", "session_id", "confidence", "evidence", "status", "resolved_at", "resolution_note", "created_at", "updated_at" FROM `memory_proposal`;--> statement-breakpoint
DROP TABLE `memory_proposal`;--> statement-breakpoint
ALTER TABLE `__new_memory_proposal` RENAME TO `memory_proposal`;--> statement-breakpoint
PRAGMA foreign_keys=ON;