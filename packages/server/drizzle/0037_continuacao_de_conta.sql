-- Escrito à mão (`034` T11): o `drizzle-kit` gerou o `REFERENCES` sem `ON DELETE`
-- — a armadilha da `0014`, de novo —, e `NO ACTION` recusaria apagar de vez a
-- sessão de origem de uma continuação. O schema declara `set null`: a continuação
-- sobrevive sem o ponteiro.
ALTER TABLE `session` ADD `continued_from_id` text REFERENCES session(id) ON DELETE set null;
