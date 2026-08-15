import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import type { EventBus } from "../events.js";
import type { SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import type { PtyManager } from "../pty/PtyManager.js";
import {
  createSessionRepository,
  type ScopeType,
  type SessionKind,
} from "../repositories/session.js";

/**
 * The process and its record, kept in step.
 *
 * `PtyManager` owns the process and knows nothing about storage; the
 * repository owns the row and knows nothing about processes. This is the one
 * place that holds both, so neither has to learn about the other.
 */

export interface StartSessionInput {
  kind: SessionKind;
  agentConfigId?: string | null;
  scopeType: ScopeType;
  scopeId: string;
  cwd: string;
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  cols?: number;
  rows?: number;
}

export interface SessionStore {
  start(input: StartSessionInput): Promise<SessionRow>;
  close(id: string): Promise<void>;
  findById(id: string): Promise<SessionRow | undefined>;
  listByScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  listRunningInScope(scopeType: ScopeType, scopeId: string): Promise<SessionRow[]>;
  /**
   * Keeps records following processes that die on their own.
   *
   * Returns an unsubscribe function. Call it once at boot: without it a crashed
   * agent stays `running` in the database forever, and F4.9 would then block
   * removals on sessions that are long gone.
   */
  trackExits(log?: Pick<FastifyBaseLogger, "warn">): () => void;
}

export interface SessionStoreOptions {
  db: Db;
  ptyManager: PtyManager;
  /**
   * Told when a process dies on its own.
   *
   * F3.7 covers this case specifically: an agent that hits its quota or crashes
   * changes the sidebar without anyone having clicked anything.
   */
  events?: EventBus;
}

export function createSessionStore({ db, ptyManager, events }: SessionStoreOptions): SessionStore {
  const sessions = createSessionRepository(db);

  return {
    async start(input) {
      const { kind, agentConfigId = null, scopeType, scopeId, cwd, command } = input;

      // The process first, so its id is the record's id: one identity for both
      // halves means no mapping table and no way for them to drift.
      const spawned = ptyManager.spawn({
        command,
        ...(input.args ? { args: input.args } : {}),
        cwd,
        ...(input.env ? { env: input.env } : {}),
        ...(input.cols === undefined ? {} : { cols: input.cols }),
        ...(input.rows === undefined ? {} : { rows: input.rows }),
      });

      try {
        return await sessions.create({
          id: spawned.id,
          kind,
          agentConfigId,
          scopeType,
          scopeId,
          cwd,
          command,
        });
      } catch (error) {
        // A process the daemon cannot describe is a process nobody can find or
        // stop from the UI. Kill it rather than leak it.
        ptyManager.kill(spawned.id);
        throw error;
      }
    },

    async close(id) {
      const row = await sessions.findById(id);
      if (!row) throw new DomainError("NOT_FOUND", `sessão ${id} não existe`);
      if (row.state === "exited") return;

      // The record is not written here: killing is asynchronous, and the exit
      // watcher is what records the code the process actually exited with.
      ptyManager.kill(id);
    },

    findById: (id) => sessions.findById(id),
    listByScope: (scopeType, scopeId) => sessions.listByScope(scopeType, scopeId),
    listRunningInScope: (scopeType, scopeId) => sessions.listRunningInScope(scopeType, scopeId),

    trackExits(log) {
      return ptyManager.watchExits((info) => {
        // Fire and forget: this runs inside node-pty's exit callback, which
        // cannot await, and a failed write must not take the daemon down.
        void (async () => {
          // Read before writing: the scope is what the event has to carry, and
          // after the update it is still there — but one read is enough.
          const row = await sessions.findById(info.id);
          await sessions.markExited(info.id, info.exitCode ?? 0);
          if (row) {
            events?.emit({
              type: "session.changed",
              scopeType: row.scopeType as "project" | "worktree",
              scopeId: row.scopeId,
            });
          }
        })().catch((error: unknown) => {
          log?.warn({ session: info.id, err: error }, "falha ao registrar saída de sessão");
        });
      });
    },
  };
}
