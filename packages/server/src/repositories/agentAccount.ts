import { newId } from "@lumem/shared";
import { and, asc, eq, isNull } from "drizzle-orm";

import type { Db } from "../db/index.js";
import {
  agentAccount,
  agentConfig,
  type AgentAccountIdentity,
  type AgentAccountRow,
} from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints, type ConstraintMap } from "./base.js";

/**
 * Contas de agente (`034` T4).
 *
 * A conta é do Lumem; o diretório dela é do CLI (o
 * [ADR de 2026-09-26](../../../../docs/adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md)).
 * Este repositório guarda a linha e nada lê do diretório — criar o diretório, os
 * links da Q10 e conferir a identidade são das tasks seguintes.
 */

export type AgentAccountKind = "subscription" | "api_key";
export type AgentAccountState = "connected" | "disconnected";

export interface AgentAccountInput {
  agentConfigId: string;
  label: string;
  kind?: AgentAccountKind;
  /** Nulo é a conta que sobe **sem** a variável — uma só por agente. */
  configDir?: string | null;
  identity?: AgentAccountIdentity | null;
  state?: AgentAccountState;
}

export interface AgentAccountRepository {
  /** Na ordem em que foram conectadas: é a ordem da *"mais antiga"* da Q8. */
  listByConfig(agentConfigId: string): Promise<AgentAccountRow[]>;
  get(id: string): Promise<AgentAccountRow | undefined>;
  create(input: AgentAccountInput): Promise<AgentAccountRow>;
  /** A conta padrão do agente, se o ponteiro aponta para uma conta **dele**. */
  defaultFor(agentConfigId: string): Promise<AgentAccountRow | undefined>;
  /**
   * A conta padrão, criada se faltar: a sem diretório, com o nome do agente.
   *
   * Idempotente, e é isso que a deixa ser chamada de onde uma sessão nasce:
   * uma configuração criada antes desta tabela, ou por um caminho que não passou
   * pelo repositório, ganha a conta na primeira sessão em vez de a sessão falhar.
   */
  ensureDefault(agentConfigId: string): Promise<AgentAccountRow>;
}

function conflicts(label: string): ConstraintMap {
  return {
    "unique:agent_account.agent_config_id,agent_account.label": {
      code: "DUPLICATE",
      message: `já existe uma conta chamada "${label}" neste agente`,
    },
    "unique:agent_account.config_dir": {
      code: "DUPLICATE",
      message: "já existe uma conta neste diretório",
    },
    // O índice parcial: duas contas sem diretório seriam o mesmo login.
    "unique:agent_account.agent_config_id": {
      code: "DUPLICATE",
      message: "este agente já tem a conta que sobe sem diretório próprio",
    },
    foreignKey: { code: "NOT_FOUND", message: "a configuração de agente informada não existe" },
    "check:agent_account_kind": { code: "INVALID_ARGUMENT", message: "tipo de conta inválido" },
    "check:agent_account_state": { code: "INVALID_ARGUMENT", message: "estado de conta inválido" },
  };
}

export function createAgentAccountRepository(db: Db): AgentAccountRepository {
  const get = (id: string): Promise<AgentAccountRow | undefined> =>
    db.query.agentAccount.findFirst({ where: eq(agentAccount.id, id) });

  async function create(input: AgentAccountInput): Promise<AgentAccountRow> {
    const [row] = await withConstraints(
      () =>
        db
          .insert(agentAccount)
          .values({
            id: newId(),
            agentConfigId: input.agentConfigId,
            label: input.label,
            configDir: input.configDir ?? null,
            identity: input.identity ?? null,
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            ...(input.state === undefined ? {} : { state: input.state }),
          })
          .returning(),
      conflicts(input.label),
    );
    return row!;
  }

  async function defaultFor(agentConfigId: string): Promise<AgentAccountRow | undefined> {
    const config = await db.query.agentConfig.findFirst({
      where: eq(agentConfig.id, agentConfigId),
    });
    if (!config?.defaultAccountId) return undefined;
    const account = await get(config.defaultAccountId);
    // Sem estrangeiro no ponteiro (ele fecharia um ciclo), a conferência é aqui.
    return account?.agentConfigId === agentConfigId ? account : undefined;
  }

  return {
    listByConfig(agentConfigId) {
      return db
        .select()
        .from(agentAccount)
        .where(eq(agentAccount.agentConfigId, agentConfigId))
        .orderBy(asc(agentAccount.createdAt));
    },

    get,
    create,
    defaultFor,

    async ensureDefault(agentConfigId) {
      const current = await defaultFor(agentConfigId);
      if (current) return current;

      const config = await db.query.agentConfig.findFirst({
        where: eq(agentConfig.id, agentConfigId),
      });
      if (!config) throw new DomainError("NOT_FOUND", `configuração ${agentConfigId} não existe`);

      // A conta sem diretório que já existe é adotada, e não duplicada: o
      // índice parcial recusaria a segunda, e ela seria o mesmo login.
      const bare = await db.query.agentAccount.findFirst({
        where: and(eq(agentAccount.agentConfigId, agentConfigId), isNull(agentAccount.configDir)),
      });
      const account = bare ?? (await create({ agentConfigId, label: config.name }));
      await db
        .update(agentConfig)
        .set({ defaultAccountId: account.id, updatedAt: new Date() })
        .where(eq(agentConfig.id, agentConfigId));
      return account;
    },
  };
}
