import { and, asc, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { session, type SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints, type ConstraintMap } from "./base.js";

/**
 * Sessions, PRD F7.1 and §6.
 *
 * What is stored is the *record* of a session — kind, scope, cwd, command,
 * state. The ring buffer stays in memory, as §7 decided: it does not survive a
 * daemon restart and neither do the processes, so persisting it would only
 * store output nobody can attach to.
 *
 * An ACP conversation is the exception, and it is not stored here either: it lives in
 * one SQLite file per session under `stateDir` (F5.4). The difference is that a
 * conversation *can* be attached to after a restart — `session/load` continues it —
 * while a shell's scrollback belongs to a process that is gone.
 */

export type SessionKind = "shell" | "agent";
export type ScopeType = "project" | "worktree";
export type SessionState = "running" | "exited";

export interface CreateSessionInput {
  /** The manager's own id. One identity for the process and its record. */
  id: string;
  kind: SessionKind;
  agentConfigId?: string | null;
  scopeType: ScopeType;
  scopeId: string;
  cwd: string;
  /** What was actually launched, so the detail view never has to guess. */
  command: string;
  /**
   * What this session is, decided at birth and never changed (D1).
   *
   * Defaulted rather than required: every caller written before ACP existed
   * meant `pty`, and the row it produces has to keep meaning that.
   */
  transport?: "pty" | "acp";
  /** The adapter's own session id. Only an ACP session has one. */
  acpSessionId?: string | null;
  /** Mode and model as the protocol reported them at creation. */
  mode?: string | null;
  model?: string | null;
  /** The session this one continues, when it was born by resuming (D12). */
  resumedFromId?: string | null;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<SessionRow>;
  findById(id: string): Promise<SessionRow | undefined>;
  listByScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  listRunning(): Promise<SessionRow[]>;
  /**
   * Every session, whatever its state.
   *
   * For the boot pass over the transcript directory, which has to tell a
   * conversation that belongs to nobody from one that is simply old.
   */
  listAll(): Promise<SessionRow[]>;
  listRunningInScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  /** Idempotent: a process only exits once, but the news can arrive twice. */
  markExited(id: string, exitCode: number): Promise<void>;
  /**
   * Records a mode or model the session switched to, D9.
   *
   * `agent_config` keeps the default and this keeps what *this* session chose (A8),
   * so reopening the tab shows the choice rather than the default.
   */
  setConfig(id: string, config: { mode?: string; model?: string }): Promise<void>;
  /**
   * F7.3: no PTY survives a daemon restart, so no record may claim otherwise.
   *
   * The exit code stays null on purpose — the daemon genuinely does not know
   * how the process ended, and inventing a 0 would say it finished cleanly.
   */
  markAllRunningExited(): Promise<number>;
  remove(id: string): Promise<void>;
}

const CONSTRAINTS: ConstraintMap = {
  foreignKey: { code: "NOT_FOUND", message: "a configuração de agente informada não existe" },
  "check:session_agent_config": {
    code: "INVALID_ARGUMENT",
    message: "sessão de agente exige uma configuração, e sessão de shell não pode ter uma",
  },
  "check:session_kind": { code: "INVALID_ARGUMENT", message: "tipo de sessão inválido" },
  "check:session_scope_type": { code: "INVALID_ARGUMENT", message: "escopo de sessão inválido" },
  "check:session_state": { code: "INVALID_ARGUMENT", message: "estado de sessão inválido" },
  "check:session_transport": { code: "INVALID_ARGUMENT", message: "transporte de sessão inválido" },
  "check:session_shell_transport": {
    code: "INVALID_ARGUMENT",
    message: "sessão de shell é sempre PTY: não existe conversa com um shell",
  },
  "check:session_acp_id": {
    code: "INVALID_ARGUMENT",
    message: "sessão ACP exige o id de sessão do adaptador, e sessão PTY não pode ter um",
  },
};

export function createSessionRepository(db: Db): SessionRepository {
  return {
    async create({ agentConfigId = null, ...input }) {
      const [row] = await withConstraints(
        () =>
          db
            .insert(session)
            .values({ ...input, agentConfigId })
            .returning(),
        CONSTRAINTS,
      );
      return row!;
    },

    findById(id) {
      return db.query.session.findFirst({ where: eq(session.id, id) });
    },

    listByScope(scopeType, scopeId) {
      return db
        .select()
        .from(session)
        .where(and(eq(session.scopeType, scopeType), eq(session.scopeId, scopeId)))
        .orderBy(asc(session.createdAt));
    },

    listRunning() {
      return db.select().from(session).where(eq(session.state, "running"));
    },

    listAll() {
      return db.select().from(session);
    },

    listRunningInScope(scopeType, scopeId) {
      return db
        .select()
        .from(session)
        .where(
          and(
            eq(session.scopeType, scopeType),
            eq(session.scopeId, scopeId),
            eq(session.state, "running"),
          ),
        );
    },

    async setConfig(id, config) {
      // Scoped to `running`: a switch racing an exit must not resurrect the row's
      // idea of what it was doing, and an exited session has nothing to switch.
      await db
        .update(session)
        .set({
          ...(config.mode === undefined ? {} : { mode: config.mode }),
          ...(config.model === undefined ? {} : { model: config.model }),
          updatedAt: new Date(),
        })
        .where(and(eq(session.id, id), eq(session.state, "running")));
    },

    async markExited(id, exitCode) {
      // Scoped to `running` rows: the exit event and the boot reconciliation
      // can both reach the same row, and the second must not rewrite an exit
      // code that was already recorded.
      await withConstraints(
        () =>
          db
            .update(session)
            .set({ state: "exited", exitCode, updatedAt: new Date() })
            .where(and(eq(session.id, id), eq(session.state, "running")))
            .returning(),
        CONSTRAINTS,
      );
    },

    async markAllRunningExited() {
      const updated = await db
        .update(session)
        .set({ state: "exited", updatedAt: new Date() })
        .where(eq(session.state, "running"))
        .returning();
      return updated.length;
    },

    async remove(id) {
      const removed = await db.delete(session).where(eq(session.id, id)).returning();
      if (removed.length === 0) throw new DomainError("NOT_FOUND", `sessão ${id} não existe`);
    },
  };
}
