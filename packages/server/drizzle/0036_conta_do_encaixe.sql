-- Escrito à mão (`034` T10): o `drizzle-kit` gerou o `REFERENCES` sem `ON DELETE`
-- — a armadilha da `0014` —, e `NO ACTION` recusaria apagar de vez uma conta que
-- um agente nomeado cita. O schema declara `set null`: o encaixe volta a herdar.
ALTER TABLE `named_agent` ADD `account_id` text REFERENCES agent_account(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `named_agent` ADD `effort` text;
