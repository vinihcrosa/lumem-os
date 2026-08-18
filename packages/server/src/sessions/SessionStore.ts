import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import type { EventBus } from "../events.js";
import type { SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createGitService, type GitService } from "../git/GitService.js";
import {
  isKilledEarly,
  recordRevertSignals,
  REVERT_LOG_FORMAT,
  REVERT_SCAN_COMMITS,
  tryRecordSignal,
} from "../memory/signals.js";
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
  /**
   * Reads the checkout's history when an agent session ends.
   *
   * The revert signal (Q17) has no hook to hang on: you revert from wherever
   * you like, and the daemon is not there when you do. So it looks — and the
   * end of an agent session in that checkout is the moment it is worth
   * looking, because it is the moment the daemon knows an agent wrote there.
   */
  git?: GitService;
}

export function createSessionStore({
  db,
  ptyManager,
  events,
  git = createGitService(),
}: SessionStoreOptions): SessionStore {
  const sessions = createSessionRepository(db);

  /** Which column of the signal names the scope the session ran in. */
  function scopeOf(row: SessionRow): { projectId?: string; worktreeId?: string } {
    return row.scopeType === "worktree" ? { worktreeId: row.scopeId } : { projectId: row.scopeId };
  }

  /**
   * The two signals an exit produces, neither of which may break the exit.
   *
   * `session_killed_early` is the exit itself read as a signal: below
   * `KILLED_EARLY_SECONDS` the session did nothing, and that says something.
   * The revert scan is the other half — a `git log` of the checkout, which is
   * how the reverted commit is found without anyone having reverted from here.
   *
   * Agent sessions only: a shell that lives four seconds is a shell.
   */
  async function recordExitSignals(
    row: SessionRow,
    endedAt: Date,
    log?: Pick<FastifyBaseLogger, "warn">,
  ): Promise<void> {
    if (row.kind !== "agent") return;

    if (isKilledEarly(row.createdAt, endedAt)) {
      tryRecordSignal(
        db,
        {
          kind: "session_killed_early",
          target: row.id,
          sessionId: row.id,
          ...scopeOf(row),
          detail: Math.round((endedAt.getTime() - row.createdAt.getTime()) / 1000),
        },
        {
          onError: (error) =>
            log?.warn({ session: row.id, err: error }, "falha ao registrar sinal"),
        },
      );
    }

    try {
      const history = await git.readLog(row.cwd, {
        format: REVERT_LOG_FORMAT,
        limit: REVERT_SCAN_COMMITS,
      });
      recordRevertSignals(db, history, { ...scopeOf(row), sessionId: row.id });
    } catch (error) {
      // A checkout removed while the session was dying, or a directory that is
      // not a repository any more. Not finding a revert is not a failure.
      log?.warn({ session: row.id, err: error }, "falha ao varrer reverts do checkout");
    }
  }

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
          const endedAt = new Date();
          await sessions.markExited(info.id, info.exitCode ?? 0);
          if (row) {
            events?.emit({
              type: "session.changed",
              scopeType: row.scopeType as "project" | "worktree",
              scopeId: row.scopeId,
            });
            // Last, and swallowing its own failures: the record and the event
            // are what the UI depends on, and a signal is never worth them.
            await recordExitSignals(row, endedAt, log);
          }
        })().catch((error: unknown) => {
          log?.warn({ session: info.id, err: error }, "falha ao registrar saída de sessão");
        });
      });
    },
  };
}
