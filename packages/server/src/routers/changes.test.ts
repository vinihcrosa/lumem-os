import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

async function setup(): Promise<{
  context: TestCaller;
  projectId: string;
  repo: string;
  worktreeId: string;
  worktreePath: string;
}> {
  context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lorebase",
  });
  const worktree = await context.api.worktree.create({ projectId: project.id, name: "teste" });
  return {
    context,
    projectId: project.id,
    repo,
    worktreeId: worktree.id,
    worktreePath: worktree.path,
  };
}

function write(root: string, file: string, content: string): void {
  const full = join(root, file);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("changes.list", () => {
  it("reports what is not committed in a worktree", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    write(worktreePath, "src/loader.ts", "a\nb\n");

    const changes = await ctx.api.changes.list({
      scopeType: "worktree",
      scopeId: worktreeId,
      ref: "worktree",
    });

    expect(changes.files).toMatchObject([{ path: "src/loader.ts", status: "untracked" }]);
    expect(changes.baseBranch).toBe("main");
  });

  it("defaults to the uncommitted view", async () => {
    const { context: ctx, worktreeId } = await setup();

    expect(await ctx.api.changes.list({ scopeType: "worktree", scopeId: worktreeId })).toMatchObject(
      { ref: "worktree" },
    );
  });

  it("includes committed work in the base view", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    write(worktreePath, "commitado.ts", "a\n");
    await runGit(worktreePath, "add", "-A");
    await runGit(worktreePath, "commit", "-m", "trabalho");

    const uncommitted = await ctx.api.changes.list({
      scopeType: "worktree",
      scopeId: worktreeId,
      ref: "worktree",
    });
    const base = await ctx.api.changes.list({
      scopeType: "worktree",
      scopeId: worktreeId,
      ref: "base",
    });

    expect(uncommitted.files).toEqual([]);
    expect(base.files.map((file) => file.path)).toEqual(["commitado.ts"]);
  });

  it("uses the project's recorded default as the base of its own checkout", async () => {
    const { context: ctx, projectId } = await setup();

    expect(
      await ctx.api.changes.list({ scopeType: "project", scopeId: projectId, ref: "base" }),
    ).toMatchObject({ baseBranch: "main", files: [] });
  });

  it("reports a checkout that vanished instead of an ENOENT", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    rmSync(worktreePath, { recursive: true, force: true });

    await expect(
      ctx.api.changes.list({ scopeType: "worktree", scopeId: worktreeId }),
    ).rejects.toThrow();
  });
});

describe("changes.patch", () => {
  it("returns the patch of one file", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    write(worktreePath, "README.md", "# fixture\nlinha nova\n");

    const patch = await ctx.api.changes.patch({
      scopeType: "worktree",
      scopeId: worktreeId,
      path: "README.md",
    });

    expect(patch.patch).toContain("+linha nova");
  });

  it("answers for a deleted file, whose path is no longer on disk", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    rmSync(join(worktreePath, "README.md"));

    const patch = await ctx.api.changes.patch({
      scopeType: "worktree",
      scopeId: worktreeId,
      path: "README.md",
    });

    expect(patch.patch).toContain("-# fixture");
  });

  it("refuses a path that escapes the checkout", async () => {
    const { context: ctx, worktreeId } = await setup();

    await expect(
      ctx.api.changes.patch({
        scopeType: "worktree",
        scopeId: worktreeId,
        path: "../../etc/passwd",
      }),
    ).rejects.toThrow(/sai do checkout/);
  });
});
