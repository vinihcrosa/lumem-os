import { existsSync } from "node:fs";

import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorktreeRepository } from "../repositories/worktree.js";

/**
 * Aligning the registry with the disk, PRD F7.4 and §8.
 *
 * The daemon is not the only thing that touches these directories: `rm -rf`,
 * a moved home, an external `git worktree remove`. The rule is that a
 * registration never disappears on its own — it becomes `missing`, visibly,
 * and the user decides.
 */

export interface ReconcileOptions {
  db: Db;
  log?: Pick<FastifyBaseLogger, "info" | "warn">;
}

export interface ReconcileReport {
  checked: number;
  markedMissing: number;
  restored: number;
  failed: number;
}

export async function reconcileWorktrees({ db, log }: ReconcileOptions): Promise<ReconcileReport> {
  const worktrees = createWorktreeRepository(db);
  const rows = await worktrees.listAll();
  const report: ReconcileReport = { checked: rows.length, markedMissing: 0, restored: 0, failed: 0 };

  for (const row of rows) {
    try {
      const present = existsSync(row.path);

      if (!present && row.state !== "missing") {
        await worktrees.setState(row.id, "missing");
        report.markedMissing += 1;
        log?.warn({ worktree: row.id, path: row.path }, "worktree ausente do disco");
        continue;
      }

      // The mount came back, the external drive is plugged in again. Leaving it
      // `missing` would mean the user has to remove and recreate a worktree
      // that is sitting right there.
      if (present && row.state === "missing") {
        await worktrees.setState(row.id, "active");
        report.restored += 1;
        log?.info({ worktree: row.id, path: row.path }, "worktree reapareceu");
      }
    } catch (error) {
      // One unreadable path must not stop the daemon from reconciling the
      // rest — that would turn a single broken project into a broken boot.
      report.failed += 1;
      log?.warn({ worktree: row.id, err: error }, "falha ao reconciliar worktree");
    }
  }

  return report;
}

/**
 * Sessions that outlived their daemon, PRD F7.3 and F5.3.
 *
 * A PTY is a child of the process that spawned it, so a restart kills every one
 * of them. A record left `running` would make F4.9 block a worktree removal on a
 * session that has not existed since the last boot — and the user would have no
 * way to close it, because there is nothing to close.
 *
 * An ACP adapter is a child too, so this covers both transports without asking
 * which one a row is: `transport` decides who *owns* a live session, and after a
 * restart there are none. Reconnecting to a surviving conversation is a
 * different feature — `session/load`, phase 5 — and it will need this to have
 * already told the truth about what did not survive.
 */
export async function reconcileOrphanSessions({ db, log }: ReconcileOptions): Promise<number> {
  const closed = await createSessionRepository(db).markAllRunningExited();
  if (closed > 0) log?.info({ closed }, "sessões órfãs encerradas");
  return closed;
}

/**
 * Everything the daemon aligns before it accepts a connection.
 *
 * Seeding is part of it: F6.4 promises the Claude Code configuration exists,
 * and a first boot that finished without it would show an empty agent menu.
 */
export async function reconcileOnBoot(options: ReconcileOptions): Promise<{
  worktrees: ReconcileReport;
  orphanSessions: number;
}> {
  await createAgentConfigRepository(options.db).seedDefaults();
  const worktrees = await reconcileWorktrees(options);
  const orphanSessions = await reconcileOrphanSessions(options);
  return { worktrees, orphanSessions };
}
