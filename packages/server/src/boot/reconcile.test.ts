import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { newId } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { withTestDb } from "../db/testing.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import { tempDir } from "../testing/git-fixtures.js";
import { createTranscriptStore } from "../acp/TranscriptStore.js";
import { reconcileOnBoot, reconcileOrphanSessions, reconcileWorktrees } from "./reconcile.js";

/** A throwaway transcript directory, since boot now sweeps one. */
function transcriptsDir(): string {
  return tempDir("lumem-reconcile-transcripts-");
}

async function projectIn(db: Db, name = "lorebase"): Promise<string> {
  const workspace = await createWorkspaceRepository(db).create({ name: `ws-${name}` });
  const project = await createProjectRepository(db).create({
    workspaceId: workspace.id,
    name,
    path: `/repos/${name}`,
    defaultBranch: "main",
  });
  return project.id;
}

/** A registration whose directory really exists on disk. */
async function registerPresent(db: Db, projectId: string, name: string): Promise<string> {
  const path = join(tempDir("lumem-reconcile-"), name);
  mkdirSync(path, { recursive: true });
  const created = await createWorktreeRepository(db).create({
    projectId,
    name,
    branch: name,
    path,
  });
  return created.id;
}

describe("reconcileWorktrees", () => {
  it("marks a worktree whose directory is gone as missing", async () => {
    // PRD §8: `rm -rf` on a worktree must not make the registration vanish
    // silently — the branch still exists and the user has to be told.
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      const worktrees = createWorktreeRepository(db);
      rmSync((await worktrees.findById(id))!.path, { recursive: true, force: true });

      const report = await reconcileWorktrees({ db });

      expect(report).toMatchObject({ checked: 1, markedMissing: 1, restored: 0, failed: 0 });
      expect((await worktrees.findById(id))?.state).toBe("missing");
    });
  });

  it("does not delete the registration", async () => {
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      const worktrees = createWorktreeRepository(db);
      rmSync((await worktrees.findById(id))!.path, { recursive: true, force: true });

      await reconcileWorktrees({ db });

      expect(await worktrees.findById(id)).toBeDefined();
    });
  });

  it("brings a worktree back to active when its directory reappears", async () => {
    // A remounted drive, a restored backup. Otherwise the user has to remove
    // and recreate a worktree that is sitting right there.
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      const worktrees = createWorktreeRepository(db);
      await worktrees.setState(id, "missing");

      const report = await reconcileWorktrees({ db });

      expect(report).toMatchObject({ restored: 1, markedMissing: 0 });
      expect((await worktrees.findById(id))?.state).toBe("active");
    });
  });

  it("leaves an untouched worktree alone", async () => {
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      await registerPresent(db, projectId, "teste");

      expect(await reconcileWorktrees({ db })).toMatchObject({
        checked: 1,
        markedMissing: 0,
        restored: 0,
      });
    });
  });

  it("keeps going across projects when one worktree fails", async () => {
    // A single broken project must not turn into a broken boot.
    await withTestDb(async (db) => {
      const first = await projectIn(db, "quebrado");
      const second = await projectIn(db, "inteiro");
      const worktrees = createWorktreeRepository(db);
      const doomed = await registerPresent(db, first, "some");
      const healthy = await registerPresent(db, second, "outro");
      rmSync((await worktrees.findById(doomed))!.path, { recursive: true, force: true });
      rmSync((await worktrees.findById(healthy))!.path, { recursive: true, force: true });

      const report = await reconcileWorktrees({ db });

      expect(report.checked).toBe(2);
      expect(report.markedMissing).toBe(2);
    });
  });

  it("does nothing, loudly, on an empty registry", async () => {
    await withTestDb(async (db) => {
      expect(await reconcileWorktrees({ db })).toEqual({
        checked: 0,
        markedMissing: 0,
        restored: 0,
        failed: 0,
      });
    });
  });
});


describe("reconcileOrphanSessions", () => {
  it("closes every session left running by the previous daemon", async () => {
    // F7.3: a PTY is a child of the process that spawned it, so a restart
    // killed all of them. A record still saying `running` would block a
    // worktree removal on something the user cannot close.
    await withTestDb(async (db) => {
      const sessions = createSessionRepository(db);
      await sessions.create({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
      });

      expect(await reconcileOrphanSessions({ db })).toBe(1);
      expect(await sessions.listRunning()).toEqual([]);
    });
  });

  it("closes an ACP conversation the same way it closes a terminal", async () => {
    // F5.3. The adapter is a child of the daemon too, so a restart ended it —
    // and a row still saying `running` would put a live-looking conversation in
    // front of a process that does not exist. Reconnecting to one is phase 5,
    // and it needs this to have already told the truth about what did not
    // survive.
    await withTestDb(async (db) => {
      const config = await createAgentConfigRepository(db).create({
        name: "claude-acp",
        command: "claude-agent-acp",
        transport: "acp",
        adapterVersion: "0.69.0",
      });
      const sessions = createSessionRepository(db);
      await sessions.create({
        id: newId(),
        kind: "agent",
        agentConfigId: config.id,
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/repo",
        command: "claude-agent-acp",
        transport: "acp",
        acpSessionId: "d81b05ee",
        mode: "auto",
        model: "opus[1m]",
      });
      await sessions.create({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
      });

      // Both, in one pass, without asking which transport a row is.
      expect(await reconcileOrphanSessions({ db })).toBe(2);
      expect(await sessions.listRunning()).toEqual([]);
    });
  });

  it("leaves the exit code null rather than claiming a clean finish", async () => {
    await withTestDb(async (db) => {
      const sessions = createSessionRepository(db);
      const id = newId();
      await sessions.create({
        id,
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
      });

      await reconcileOrphanSessions({ db });

      // The daemon genuinely does not know how it ended; a 0 would say it
      // finished cleanly.
      expect((await sessions.findById(id))?.exitCode).toBeNull();
    });
  });

  it("does not touch sessions that already ended", async () => {
    await withTestDb(async (db) => {
      const sessions = createSessionRepository(db);
      const id = newId();
      await sessions.create({
        id,
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
      });
      await sessions.markExited(id, 7);

      expect(await reconcileOrphanSessions({ db })).toBe(0);
      expect((await sessions.findById(id))?.exitCode).toBe(7);
    });
  });
});

describe("reconcileOnBoot", () => {
  it("seeds the default agent configuration", async () => {
    // F6.4: a first boot that finished without it would show an empty menu.
    await withTestDb(async (db) => {
      await reconcileOnBoot({ db, transcriptsDir: transcriptsDir() });

      expect((await createAgentConfigRepository(db).list()).map((row) => row.name)).toEqual([
        "claude-code",
      ]);
    });
  });

  it("runs the whole alignment in one call", async () => {
    await withTestDb(async (db) => {
      const projectId = await projectIn(db);
      const id = await registerPresent(db, projectId, "teste");
      rmSync((await createWorktreeRepository(db).findById(id))!.path, {
        recursive: true,
        force: true,
      });
      await createSessionRepository(db).create({
        id: newId(),
        kind: "shell",
        scopeType: "worktree",
        scopeId: id,
        cwd: "/w",
        command: "/bin/sh",
      });

      const report = await reconcileOnBoot({ db, transcriptsDir: transcriptsDir() });

      expect(report.worktrees.markedMissing).toBe(1);
      expect(report.orphanSessions).toBe(1);
    });
  });

  it("sweeps the transcript of a session the registry no longer has", async () => {
    /*
     * The order inside `reconcileOnBoot` is what this really checks. A session the
     * last daemon left `running` is marked exited first, which both makes it a
     * candidate for the sweep and moves its timestamp — so the sweep sees it as
     * freshly ended and leaves it warm, while a conversation with no row at all is
     * deleted on the spot.
     */
    await withTestDb(async (db) => {
      const dir = transcriptsDir();
      const store = createTranscriptStore({ dir });
      const projectId = await projectIn(db, "sweep");
      const worktreeId = await registerPresent(db, projectId, "sweep");
      const live = newId();
      await createSessionRepository(db).create({
        id: live,
        kind: "shell",
        scopeType: "worktree",
        scopeId: worktreeId,
        cwd: "/w",
        command: "/bin/sh",
      });
      store.append(live, {
        at: 1,
        event: { type: "message", messageId: "m", role: "agent", text: "sobrevive" },
      });
      store.append("ninguem-me-quer", {
        at: 1,
        event: { type: "message", messageId: "m", role: "agent", text: "vai embora" },
      });
      store.close();

      const report = await reconcileOnBoot({ db, transcriptsDir: dir });

      expect(report.transcripts.dropped).toBe(1);
      expect(report.transcripts.compressed).toBe(0);
      expect(existsSync(join(dir, `${live}.db`))).toBe(true);
      expect(existsSync(join(dir, "ninguem-me-quer.db"))).toBe(false);
    });
  });

  it("is idempotent across restarts", async () => {
    await withTestDb(async (db) => {
      const dir = transcriptsDir();
      await reconcileOnBoot({ db, transcriptsDir: dir });
      await reconcileOnBoot({ db, transcriptsDir: dir });

      expect(await createAgentConfigRepository(db).list()).toHaveLength(1);
    });
  });
});
