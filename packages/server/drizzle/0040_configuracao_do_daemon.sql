CREATE TABLE `daemon_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`update_check` integer DEFAULT 1 NOT NULL,
	`auto_update` text DEFAULT 'off' NOT NULL,
	CONSTRAINT "daemon_settings_single_row" CHECK("daemon_settings"."id" = 1),
	CONSTRAINT "daemon_settings_update_check" CHECK("daemon_settings"."update_check" IN (0, 1)),
	CONSTRAINT "daemon_settings_auto_update" CHECK("daemon_settings"."auto_update" IN ('off', 'idle'))
);
--> statement-breakpoint
-- A única linha, com os padrões da tabela (`038` C24): quem lê nunca trata a ausência.
INSERT INTO `daemon_settings` (`id`) VALUES (1);
