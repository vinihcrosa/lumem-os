import { newId } from "@lumem/shared";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";

import type { Db } from "../db/index.js";
import {
  agentAccount,
  agentConfig,
  session,
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
  /** Dado quando o diretório da conta precisa do id antes da linha (`connect`). */
  id?: string;
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
   * A conta padrão — conectada, sempre.
   *
   * Sem uma, a conectada **mais antiga** assume (a nota da Q8); sem nenhuma
   * conta, nasce a sem diretório, com o nome do agente (o primeiro acesso). E
   * com contas, mas nenhuma conectada, a recusa é `BLOCKED`: a conversa nova
   * pede para conectar em vez de subir numa conta cujo login foi desfeito.
   */
  ensureDefault(agentConfigId: string): Promise<AgentAccountRow>;
  /** O mesmo, sem recusar: `null` quando há contas e nenhuma está conectada. */
  resolveDefault(agentConfigId: string): Promise<AgentAccountRow | null>;
  /**
   * O login conferiu (`034` T8): a conta fica `connected`, e vira a padrão se
   * o agente não tem uma padrão conectada — *a primeira conectada* da Q8.
   */
  markConnected(id: string): Promise<void>;
  /**
   * `disconnected`, guardando o diretório (Q8). Se era a padrão, a padrão passa
   * à conectada mais antiga, ou a nenhuma.
   */
  disconnect(id: string): Promise<void>;
  /** Recusa uma desconectada: a padrão é onde a conversa nova nasce. */
  setDefault(id: string): Promise<void>;
  /** Modelo e effort padrão da conta — o trio da emenda da Q1. */
  setDefaults(id: string, defaults: { model: string | null; effort: string | null }): Promise<void>;
  /** Quantas sessões rodaram nesta conta — a contagem que o `purge` exige. */
  sessionCount(id: string): Promise<number>;
  /** Se alguma sessão desta conta ainda está viva. */
  hasRunningSession(id: string): Promise<boolean>;
  /**
   * Apaga a conta e as sessões dela, numa transação. O diretório e o segredo
   * são de quem chama — isto é só o banco.
   */
  purge(id: string): Promise<void>;
  /** O que a conferência leu (`034` T6). Só com login: deslogado não apaga o e-mail. */
  recordIdentity(id: string, identity: AgentAccountIdentity): Promise<void>;
  /** As contas conectadas de um agente — as que o aquecimento do boot confere. */
  listConnected(agentConfigId: string): Promise<AgentAccountRow[]>;
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
            id: input.id ?? newId(),
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

  async function require_(id: string): Promise<AgentAccountRow> {
    const found = await get(id);
    if (!found) throw new DomainError("NOT_FOUND", `conta ${id} não existe`);
    return found;
  }

  function pointDefault(agentConfigId: string, accountId: string | null): Promise<unknown> {
    return db
      .update(agentConfig)
      .set({ defaultAccountId: accountId, updatedAt: new Date() })
      .where(eq(agentConfig.id, agentConfigId));
  }

  /** A conectada mais antiga do agente, fora `except`. */
  function oldestConnected(agentConfigId: string, except?: string): Promise<AgentAccountRow | undefined> {
    return db.query.agentAccount.findFirst({
      where: and(
        eq(agentAccount.agentConfigId, agentConfigId),
        eq(agentAccount.state, "connected"),
        ...(except === undefined ? [] : [ne(agentAccount.id, except)]),
      ),
      orderBy: asc(agentAccount.createdAt),
    });
  }

  async function resolveDefault(agentConfigId: string): Promise<AgentAccountRow | null> {
    const current = await defaultFor(agentConfigId);
    if (current?.state === "connected") return current;

    const config = await db.query.agentConfig.findFirst({
      where: eq(agentConfig.id, agentConfigId),
    });
    if (!config) throw new DomainError("NOT_FOUND", `configuração ${agentConfigId} não existe`);

    const oldest = await oldestConnected(agentConfigId);
    const any = oldest ?? (await db.query.agentAccount.findFirst({
      where: eq(agentAccount.agentConfigId, agentConfigId),
    }));
    // Contas existem e nenhuma está conectada: não há padrão, de propósito.
    if (oldest === undefined && any !== undefined) {
      if (config.defaultAccountId !== null) await pointDefault(agentConfigId, null);
      return null;
    }
    const account = oldest ?? (await create({ agentConfigId, label: config.name }));
    await pointDefault(agentConfigId, account.id);
    return account;
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

    async recordIdentity(id, identity) {
      await db
        .update(agentAccount)
        .set({ identity, updatedAt: new Date() })
        .where(eq(agentAccount.id, id));
    },

    listConnected(agentConfigId) {
      return db
        .select()
        .from(agentAccount)
        .where(and(eq(agentAccount.agentConfigId, agentConfigId), eq(agentAccount.state, "connected")))
        .orderBy(asc(agentAccount.createdAt));
    },

    resolveDefault,

    async ensureDefault(agentConfigId) {
      const account = await resolveDefault(agentConfigId);
      if (account === null) {
        throw new DomainError(
          "BLOCKED",
          "nenhuma conta deste agente está conectada — conecte uma conta para abrir a conversa",
        );
      }
      return account;
    },

    async markConnected(id) {
      const account = await require_(id);
      await db
        .update(agentAccount)
        .set({ state: "connected", updatedAt: new Date() })
        .where(eq(agentAccount.id, id));
      const current = await defaultFor(account.agentConfigId);
      if (current?.state !== "connected") await pointDefault(account.agentConfigId, id);
    },

    async disconnect(id) {
      const account = await require_(id);
      await db
        .update(agentAccount)
        .set({ state: "disconnected", updatedAt: new Date() })
        .where(eq(agentAccount.id, id));
      const current = await defaultFor(account.agentConfigId);
      if (current === undefined || current.id === id) {
        const next = await oldestConnected(account.agentConfigId, id);
        await pointDefault(account.agentConfigId, next?.id ?? null);
      }
    },

    async setDefault(id) {
      const account = await require_(id);
      if (account.state !== "connected") {
        throw new DomainError("BLOCKED", "conecte a conta antes de torná-la padrão");
      }
      await pointDefault(account.agentConfigId, id);
    },

    async setDefaults(id, { model, effort }) {
      await require_(id);
      await db
        .update(agentAccount)
        .set({ defaultModel: model, defaultEffort: effort, updatedAt: new Date() })
        .where(eq(agentAccount.id, id));
    },

    async sessionCount(id) {
      const [row] = await db
        .select({ value: count() })
        .from(session)
        .where(eq(session.agentAccountId, id));
      return row?.value ?? 0;
    },

    async hasRunningSession(id) {
      const found = await db.query.session.findFirst({
        where: and(eq(session.agentAccountId, id), eq(session.state, "running")),
      });
      return found !== undefined;
    },

    async purge(id) {
      const account = await require_(id);
      const current = await defaultFor(account.agentConfigId);
      const next = current?.id === id ? await oldestConnected(account.agentConfigId, id) : undefined;
      /*
       * As sessões vão junto, e é isso que a contagem da frase avisa (Q8). O
       * `session.agent_account_id` é `RESTRICT`: sem apagar as linhas, a conta
       * não sai. O consumo fica — `session_usage` não tem estrangeiro, é
       * histórico —, e a transcrição do Lumem cai na manutenção do boot, que já
       * remove o que sobrou de um purge.
       */
      db.transaction((tx) => {
        tx.delete(session).where(eq(session.agentAccountId, id)).run();
        if (current?.id === id) {
          tx.update(agentConfig)
            .set({ defaultAccountId: next?.id ?? null, updatedAt: new Date() })
            .where(eq(agentConfig.id, account.agentConfigId))
            .run();
        }
        tx.delete(agentAccount).where(eq(agentAccount.id, id)).run();
      });
    },
  };
}

/**
 * A conta padrão de um adaptador, **síncrona** (`034` T9) — para o catálogo,
 * que a pergunta dentro de um `load` e de uma leitura que não são assíncronos.
 * Pela configuração viva com o nome do adaptador, que é a ponte do
 * `configForAdapter`.
 */
export function defaultAccountIdOf(db: Db, adapterId: string): string | null {
  const config = db
    .select({ defaultAccountId: agentConfig.defaultAccountId })
    .from(agentConfig)
    .where(and(eq(agentConfig.name, adapterId), isNull(agentConfig.retiredAt)))
    .get();
  return config?.defaultAccountId ?? null;
}
