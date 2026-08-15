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
 */

export type SessionKind = "shell" | "agent";
export type ScopeType = "project" | "worktree";
export type SessionState = "running" | "exited";

export interface CreateSessionInput {
  /** The PTY's own id. One identity for the process and its record. */
  id: string;
  kind: SessionKind;
  agentConfigId?: string | null;
  scopeType: ScopeType;
  scopeId: string;
  cwd: string;
  /** What was actually launched, so the detail view never has to guess. */
  command: string;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<SessionRow>;
  findById(id: string): Promise<SessionRow | undefined>;
  listByScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  listRunning(): Promise<SessionRow[]>;
  listRunningInScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  /** Idempotent: a process only exits once, but the news can arrive twice. */
  markExited(id: string, exitCode: number): Promise<void>;
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
