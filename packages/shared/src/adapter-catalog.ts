import { z } from "zod";

import { acpCommandSchema, acpConfigOptionSchema } from "./acp-protocol.js";
import type { AcpCommand, AcpConfigOption } from "./acp-protocol.js";

/**
 * O catálogo de adaptador (`033` §3.1) — o que o daemon sabe de um adaptador
 * **sem ter uma sessão viva dele**.
 *
 * Existe porque a sessão de agente é preguiçosa (Q4): a pílula de modelo e o
 * menu `/` do rascunho precisam de dado antes de qualquer processo subir. É
 * cache, nunca fonte de verdade — um arquivo corrompido lê vazio, e a próxima
 * sessão o repõe.
 */
export const adapterCatalogEntrySchema = z.object({
  /** `spec.id` — `claude`, `codex`. */
  adapterId: z.string().min(1),
  /**
   * O `spec.pinnedVersion` no instante da captura, e a chave de validade: trocar
   * o pino invalida a entrada (Q5).
   *
   * `null` quando o id não tem spec em `ADAPTERS` (a config fake dos e2e): não
   * há pino contra o que conferir, e o dia em que o id ganhar spec a entrada cai
   * sozinha, porque `null` não é versão nenhuma.
   */
  adapterVersion: z.string().nullable(),
  /**
   * As opções do `session/new`: o `currentValue` é o **padrão do ACP** (Q8), e
   * por isso nunca vem de `set_config_option`.
   */
  configOptions: z.array(acpConfigOptionSchema),
  /**
   * As opções **depois** de escolher cada modelo, pelo valor do modelo (M1a).
   *
   * Existe porque a opção de *effort* depende do modelo — `haiku` não tem, o
   * `gpt-6-astra` vai até `ultra` —, e o `session/new` só conta a do padrão.
   * Vazio quer dizer *ninguém percorreu os modelos ainda*.
   */
  optionsByModel: z.record(z.string(), z.array(acpConfigOptionSchema)),
  /** Do último probe; `false` quando veio de sessão real; `null` se nunca houve opção gravada. */
  authRequired: z.boolean().nullable(),
  /**
   * `projectId` → os últimos comandos vistos (Q4). Por projeto porque as skills
   * do repositório entram na lista e dependem do `cwd`.
   */
  commandsByProject: z.record(z.string(), z.array(acpCommandSchema)),
  /** Epoch ms da última mudança de conteúdo. */
  capturedAt: z.number().int(),
});
export type AdapterCatalogEntry = z.infer<typeof adapterCatalogEntrySchema>;

/** O que a web recebe, um por adaptador. */
export interface AdapterCatalogView {
  adapterId: string;
  label: string;
  /** `adapterCommandFor` não lança. */
  installed: boolean;
  /** `null` = nunca sondado. */
  authRequired: boolean | null;
  configOptions: AcpConfigOption[];
  optionsByModel: Record<string, AcpConfigOption[]>;
  /** Do projeto pedido; `[]` se nunca visto ou se nenhum projeto foi pedido. */
  commands: AcpCommand[];
}
