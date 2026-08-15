import { existsSync } from "node:fs";

import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
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
