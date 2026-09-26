ALTER TABLE `task` ADD `status_changed_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill à mão, e o `DEFAULT 0` acima é o motivo: o SQLite recusa
-- `ADD COLUMN` com default não-constante, então não dá para carimbar *agora* na
-- própria coluna — e carimbar *agora* seria errado de qualquer jeito. Toda
-- tarefa que já estava parada acordaria da migração dizendo "há 0 s", apagando
-- exatamente o encalhe que a coluna existe para mostrar. `updated_at` é o
-- melhor registro de quando alguém mexeu nela pela última vez: um limite
-- superior da verdade, que erra para o lado seguro — nunca inventa encalhe que
-- não houve.
UPDATE `task` SET `status_changed_at` = `updated_at`;
