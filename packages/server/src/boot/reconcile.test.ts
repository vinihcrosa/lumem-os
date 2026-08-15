import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { newId } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { withTestDb } from "../db/testing.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { tempDir } from "../testing/git-fixtures.js";
import { reconcileWorktrees } from "./reconcile.js";

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
