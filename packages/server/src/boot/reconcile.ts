import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

import type { FastifyBaseLogger } from "fastify";

import type { ServerConfig } from "../config.js";
import type { Db } from "../db/index.js";
import { createGitService, type GitService } from "../git/GitService.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { projectHome, worktreeDir } from "../workspace-layout.js";

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

export interface BootOptions extends ReconcileOptions {
  config: ServerConfig;
  /** Overridable only so a test can watch the commands; nothing mocks git. */
  git?: GitService;
}

export interface LayoutMigrationReport {
  checked: number;
  moved: number;
  failed: number;
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
 * Sessions that outlived their daemon, PRD F7.3.
 *
 * A PTY is a child of the process that spawned it, so a restart kills every
 * one of them. A record left `running` would make F4.9 block a worktree
 * removal on a session that has not existed since the last boot — and the user
 * would have no way to close it, because there is nothing to close.
 */
export async function reconcileOrphanSessions({ db, log }: ReconcileOptions): Promise<number> {
  const closed = await createSessionRepository(db).markAllRunningExited();
  if (closed > 0) log?.info({ closed }, "sessões órfãs encerradas");
  return closed;
}

/**
 * The worktrees of the old tree, moved under their project, F6.12.
 *
 * Q20 replaced `~/.lumem/worktrees/<projeto>/<nome>` with
 * `~/.lumem/workspaces/<workspace>/<projeto>/worktrees/<nome>`. Rows already in
 * the registry point at the old place with absolute paths, so they keep working
 * — which is precisely why nothing would ever move them, and the tree the
 * question set out to unify would stay split on the only machine with data.
 *
 * The move is not a `rename` and nothing else. A worktree keeps **absolute**
 * paths on both sides of its link, and a `rename` invalidates one of them: the
 * repository goes on naming the old location, so it lists a worktree that is no
 * longer there and a `git worktree prune` — which git runs on its own during
 * several ordinary operations — deletes that worktree's administration. The
 * checkout breaks later, far from the move that did it, which is the only
 * silent failure this feature can produce. `git worktree repair` is what fixes
 * the side a `rename` cannot.
 *
 * Runs once and is idempotent: a worktree already in the right place is skipped,
 * and one missing from disk is left for `reconcileWorktrees` to mark.
 */
export async function migrateWorktreeLayout({
  db,
  config,
  git = createGitService(),
  log,
}: BootOptions): Promise<LayoutMigrationReport> {
  const worktrees = createWorktreeRepository(db);
  const projects = createProjectRepository(db);
  const workspaces = createWorkspaceRepository(db);

  const rows = await worktrees.listAll();
  const report: LayoutMigrationReport = { checked: rows.length, moved: 0, failed: 0 };

  for (const row of rows) {
    try {
      const project = await projects.findById(row.projectId);
      if (!project) continue;
      const workspace = await workspaces.findById(project.workspaceId);
      if (!workspace) continue;

      const target = worktreeDir(
        projectHome(config.workspacesDir, workspace.name, project.name),
        row.name,
      );
      if (target === row.path) continue;

      // A directory that is not there is not a migration, it is the case
      // `reconcileWorktrees` already knows how to report.
      if (!existsSync(row.path)) continue;
      if (existsSync(target)) {
        report.failed += 1;
        log?.warn({ worktree: row.id, target }, "destino da migração já existe");
        continue;
      }

      await mkdir(dirname(target), { recursive: true });
      await rename(row.path, target);
      try {
        // The half that a `mv` does not do. Run from the main repository, which
        // is the side that holds the other absolute path.
        await git.repairWorktree({ repoPath: project.path, path: target });
      } catch (error) {
        // A checkout that moved but was not repaired is worse than one that
        // never moved: it looks like a working tree and is not one, and the row
        // still names the old place. Put it back and report, rather than leave
        // half a migration behind.
        await rename(target, row.path).catch(() => {});
        throw error;
      }
      await worktrees.setPath(row.id, target);

      report.moved += 1;
      log?.info({ worktree: row.id, from: row.path, to: target }, "worktree movida para a árvore nova");
    } catch (error) {
      // One worktree that cannot move must not stop the others, nor the boot.
      report.failed += 1;
      log?.warn({ worktree: row.id, err: error }, "falha ao migrar worktree");
    }
  }

  return report;
}

/**
 * Everything the daemon aligns before it accepts a connection.
 *
 * Seeding is part of it: F6.4 promises the Claude Code configuration exists,
 * and a first boot that finished without it would show an empty agent menu.
 */
export async function reconcileOnBoot(options: BootOptions): Promise<{
  layout: LayoutMigrationReport;
  worktrees: ReconcileReport;
  orphanSessions: number;
}> {
  await createAgentConfigRepository(options.db).seedDefaults();
  // Before the reconciliation, not after: it is the one that decides which
  // worktrees are missing, and it has to judge the paths the migration wrote.
  const layout = await migrateWorktreeLayout(options);
  const worktrees = await reconcileWorktrees(options);
  const orphanSessions = await reconcileOrphanSessions(options);
  return { layout, worktrees, orphanSessions };
}
