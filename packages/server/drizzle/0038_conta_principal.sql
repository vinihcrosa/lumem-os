-- Escrito à mão (`034` T18): só dado, e por isso o `drizzle-kit generate --custom`
-- não tem o que gerar. A conta que já existia nasceu na `0035` com o nome do
-- agente, e o cabeçalho lia `claude · claude` — contra a Q2 (*"o nome é seu"*).
-- Ela passa a se chamar `principal`, e se renomeia na tela. Só a sem diretório e
-- só com o rótulo que a `0035` deu: rótulo que alguém digitou não se toca, nem o
-- que bateria no índice único por já haver uma `principal` naquele agente.
UPDATE `agent_account` SET "label" = 'principal' WHERE "config_dir" IS NULL AND "label" = (SELECT `agent_config`."name" FROM `agent_config` WHERE `agent_config`."id" = `agent_account`."agent_config_id") AND NOT EXISTS (SELECT 1 FROM `agent_account` AS `other` WHERE `other`."agent_config_id" = `agent_account`."agent_config_id" AND `other`."label" = 'principal');
