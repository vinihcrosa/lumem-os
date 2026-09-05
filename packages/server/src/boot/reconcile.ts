import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { FastifyBaseLogger } from "fastify";

import { sweepTranscripts, type TranscriptSweepReport } from "../acp/transcript-maintenance.js";
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

export interface ReconcileOnBootOptions extends ReconcileOptions {
  /**
   * Where conversations are kept (F5.4).
   *
   * Required rather than defaulted: the pass deletes transcripts the registry no
   * longer owns, and a default would point that at whatever directory happened to be
   * guessed. The daemon has the answer in its config and has to say it.
   */
  transcriptsDir: string;
}

/**
 * What the passes that touch the disk layout need.
 *
 * Deliberately **not** carrying `transcriptsDir`: moving worktrees and sweeping
 * interrupted clones have nothing to do with conversations, and requiring the
 * directory here would make every one of their tests invent one.
 */
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

/** The prefix `cloneRepository` gives the only directory it leaves lying about. */
export const CLONE_TEMP_PREFIX = ".lumem-clone-";

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
 * The transcript directory, aligned with the registry (F5.4, D11).
 *
 * Runs *after* the orphan sessions are marked exited, and that order matters: a
 * session the last daemon left `running` has to become `exited` before the pass can
 * see it as a candidate at all, and marking it moves its timestamp so the pass then
 * correctly leaves it warm.
 */
export async function reconcileTranscripts({
  db,
  transcriptsDir,
  log,
}: ReconcileOnBootOptions): Promise<TranscriptSweepReport> {
  const sessions = await createSessionRepository(db).listAll();
  return sweepTranscripts({
    dir: transcriptsDir,
    sessions: sessions.map((row) => ({
      id: row.id,
      state: row.state === "running" ? "running" : "exited",
      updatedAt: row.updatedAt.getTime(),
    })),
    ...(log ? { log } : {}),
  });
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
 * What an interrupted clone left behind, F6.7.
 *
 * A clone runs for minutes, so the daemon dying in the middle of one is the
 * ordinary case rather than the rare one. The job that knew about it was in
 * memory and died with the process (Q4) — which is exactly why the temporary
 * directory is named after a fixed prefix instead: the sweep recognises it
 * without needing to have been told anything.
 *
 * Nothing outside that prefix is touched, ever. This function deletes, and a
 * function that deletes has to be boring about what it matches.
 */
export async function reconcileClones({ config, log }: BootOptions): Promise<number> {
  let removed = 0;

  for (const workspace of await subdirectories(config.workspacesDir)) {
    for (const project of await subdirectories(workspace)) {
      for (const entry of await readdir(project, { withFileTypes: true }).catch(() => [])) {
        if (!entry.name.startsWith(CLONE_TEMP_PREFIX)) continue;
        try {
          await rm(join(project, entry.name), { recursive: true, force: true });
          removed += 1;
        } catch (error) {
          // Same rule as everything else at boot: one path nobody can delete
          // must not stop the daemon from starting.
          log?.warn({ path: join(project, entry.name), err: error }, "não deu para limpar clone");
        }
      }
    }
  }

  if (removed > 0) log?.info({ removed }, "restos de clone removidos");
  return removed;
}

async function subdirectories(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name));
}

/**
 * Everything the daemon aligns before it accepts a connection.
 *
 * Seeding is part of it: F6.4 promises the Claude Code configuration exists,
 * and a first boot that finished without it would show an empty agent menu.
 */
export async function reconcileOnBoot(options: BootOptions & ReconcileOnBootOptions): Promise<{
  layout: LayoutMigrationReport;
  clones: number;
  worktrees: ReconcileReport;
  orphanSessions: number;
  transcripts: TranscriptSweepReport;
}> {
  await createAgentConfigRepository(options.db).seedDefaults();
  // Before the reconciliation, not after: it is the one that decides which
  // worktrees are missing, and it has to judge the paths the migration wrote.
  const layout = await migrateWorktreeLayout(options);
  const clones = await reconcileClones(options).catch(() => 0);
  const worktrees = await reconcileWorktrees(options);
  const orphanSessions = await reconcileOrphanSessions(options);
  const transcripts = await reconcileTranscripts(options);
  return { layout, clones, worktrees, orphanSessions, transcripts };
}
