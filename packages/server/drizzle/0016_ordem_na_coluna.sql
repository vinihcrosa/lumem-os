ALTER TABLE `task` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `task_by_position` ON `task` (`workspace_id`,`status`,`position`);--> statement-breakpoint
-- Backfill escrito à mão: o `drizzle-kit` só sabe o DEFAULT, e com todas as
-- linhas em zero a coluna do quadro nasceria numa ordem que o SQLite escolhe.
-- Ordem de chegada é a que o §4.3 declara para quem nunca arrastou, e
-- `created_at` é o único registro dela que existe.
UPDATE `task` SET `position` = (
  SELECT COUNT(*) FROM `task` AS `earlier`
  WHERE `earlier`.`workspace_id` = `task`.`workspace_id`
    AND `earlier`.`status` = `task`.`status`
    AND (`earlier`.`created_at` < `task`.`created_at`
         OR (`earlier`.`created_at` = `task`.`created_at` AND `earlier`.`id` < `task`.`id`))
);
