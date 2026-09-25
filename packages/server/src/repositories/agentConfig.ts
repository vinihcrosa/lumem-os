import { adapterById, newId } from "@lumem/shared";
import { asc, eq, isNull } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { agentConfig, type AgentConfigRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints, type ConstraintMap } from "./base.js";

/**
 * Agent configurations, PRD F6.1–F6.4.
 *
 * A configuration is a recipe, not code: name, command, args, env. Adding
 * another agent is adding a row — that is the whole point of §3, and it is why
 * nothing in the daemon knows what "claude" is.
 */

export interface AgentConfigInput {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /**
   * Required, because every configuration is an ACP adapter (`033` F1.1).
   *
   * Pinned, never `@latest` (A12): the adapter publishes almost daily, and one
   * that changes underneath a running session fails invisibly.
   */
  adapterVersion: string;
}

export interface AgentConfigRepository {
  create(input: AgentConfigInput): Promise<AgentConfigRow>;
  /** Only the configurations that can still launch something (`033` F1.3). */
  list(): Promise<AgentConfigRow[]>;
  /** Finds a retired one too: the legacy session still needs its name (F1.4). */
  findById(id: string): Promise<AgentConfigRow | undefined>;
  findByName(name: string): Promise<AgentConfigRow | undefined>;
  update(id: string, input: Partial<AgentConfigInput>): Promise<AgentConfigRow>;
  remove(id: string): Promise<void>;
}

/*
 * A semente saiu daqui, e não voltou como outra constante.
 *
 * O `DEFAULT_AGENT_CONFIG` (`pty` + `claude`) era anterior ao ACP: ele existia
 * para que o primeiro boot não mostrasse um menu de agentes vazio, num tempo em
 * que ninguém criava configuração nenhuma. Hoje o primeiro acesso e o rodapé de
 * login criam a configuração **ACP** com a versão que o handshake detectou, e a
 * semente ficava na lista como uma segunda opção que ninguém pediu.
 *
 * A `C6` da `second-agent` é o registro: com o catálogo de adaptadores no
 * `shared`, semear passou a significar **escolher uma spec** — e `pty` + `claude`
 * não é uma delas. Uma semente que não sai do catálogo seria a sexta constante de
 * Claude escondida num lugar novo, no mesmo PR que tira as outras cinco.
 *
 * Quem já tem a linha no banco continua com ela: não há migração que apague
 * configuração de ninguém — a de PTY a `0033` **aposentou** (`retired_at`) em
 * vez de apagar, e o caminho alternativo acabou (ADR de 2026-09-24).
 */

function conflicts(name: string): ConstraintMap {
  return {
    "unique:agent_config.name": {
      code: "DUPLICATE",
      message: `já existe uma configuração chamada "${name}"`,
    },
    foreignKey: {
      code: "IN_USE",
      message: "a configuração ainda está em uso por alguma sessão",
    },
    // Without this the CHECK surfaces as a raw SQLite error, which reads as a
    // daemon defect rather than as the one thing the caller got wrong.
    "check:agent_config_adapter_version": {
      code: "INVALID_ARGUMENT",
      message: "configuração de agente precisa de uma versão de adaptador fixa",
    },
  };
}

export function createAgentConfigRepository(db: Db): AgentConfigRepository {
  async function require_(id: string): Promise<AgentConfigRow> {
    const found = await db.query.agentConfig.findFirst({ where: eq(agentConfig.id, id) });
    if (!found) throw new DomainError("NOT_FOUND", `configuração ${id} não existe`);
    return found;
  }

  return {
    async create({ name, command, args = [], env = {}, adapterVersion }) {
      const [row] = await withConstraints(
        () =>
          db
            .insert(agentConfig)
            .values({ id: newId(), name, command, args, env, adapterVersion })
            .returning(),
        conflicts(name),
      );
      return row!;
    },

    list() {
      return db
        .select()
        .from(agentConfig)
        .where(isNull(agentConfig.retiredAt))
        .orderBy(asc(agentConfig.name));
    },

    findById(id) {
      return db.query.agentConfig.findFirst({ where: eq(agentConfig.id, id) });
    },

    findByName(name) {
      return db.query.agentConfig.findFirst({ where: eq(agentConfig.name, name) });
    },

    async update(id, input) {
      const current = await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(agentConfig)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(agentConfig.id, id))
            .returning(),
        conflicts(input.name ?? current.name),
      );
      return row!;
    },

    async remove(id) {
      await require_(id);
      // A session still pointing here keeps it: the detail view has to be able
      // to say what the process was launched from, even after it exited.
      await withConstraints(
        () => db.delete(agentConfig).where(eq(agentConfig.id, id)).returning(),
        conflicts(""),
      );
    },
  };
}

/**
 * A configuração de agente para este adaptador, criada na primeira vez.
 *
 * O catálogo do §5.1 fala em **adaptador** (`claude`, `codex`); o
 * `session.createAgent` pede uma `agent_config`, que é a linha que o rodapé da
 * sidebar mostra. A ponte é o nome: uma configuração por adaptador, com o nome
 * do adaptador.
 *
 * **Criada e não exigida** porque a esteira não pode depender de alguém ter
 * aberto uma conversa antes: um workspace novo com a autonomia ligada tem tarefa
 * e não tem configuração nenhuma, e recusar ali seria a esteira parando por
 * causa de uma linha que ela mesma sabe escrever.
 *
 * Mora aqui, e não na costura da esteira, porque criar configuração é deste
 * repositório (`033` T4): a esteira é só quem mais chama.
 */
export async function configForAdapter(
  db: Db,
  adapterId: string,
  /** O `conveyorAgent` do `config`, quando alguém apontou um. */
  preferred: string | null = null,
): Promise<string> {
  const configs = createAgentConfigRepository(db);
  if (preferred !== null) {
    const named = await configs.findByName(preferred);
    /*
     * Apontado e **não encontrado** é erro, não silêncio: quem escreveu
     * `LUMEM_CONVEYOR_AGENT` disse qual agente quer, e cair no default seria a
     * esteira abrindo o adaptador errado — que gasta — sem nada dizer.
     */
    if (!named) throw new Error(`a configuração de agente "${preferred}" não existe`);
    return named.id;
  }

  const spec = adapterById(adapterId);
  if (spec === null) throw new Error(`adaptador desconhecido: ${adapterId}`);

  const existing = await configs.findByName(spec.id);
  if (existing) return existing.id;

  const created = await configs.create({
    name: spec.id,
    /*
     * O comando é o da `spec`, e quem o resolve de verdade é o
     * `adapterCommandForConfig` na hora do `spawn` — o
     * [ADR de 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
     * tirou essa decisão desta coluna justamente porque ela envelhece. O que
     * fica aqui é o nome, não o caminho.
     */
    command: spec.command,
    adapterVersion: spec.pinnedVersion,
  });
  return created.id;
}
