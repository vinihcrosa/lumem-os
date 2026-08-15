import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

/** A project on a real repository, plus a worktree cut from it. */
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
  mkdirSync(join(repo, "src", "lore"), { recursive: true });
  writeFileSync(join(repo, "src", "lore", "loader.ts"), "const a = 1;\n");
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

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("files.listDir", () => {
  it("lists the project's own checkout", async () => {
    const { context: ctx, projectId } = await setup();

    const listing = await ctx.api.files.listDir({
      scopeType: "project",
      scopeId: projectId,
      path: "",
    });

    expect(listing.entries.map((entry) => entry.name)).toContain("README.md");
    expect(listing.entries.map((entry) => entry.name)).toContain("src");
  });

  it("lists a worktree, which is a different directory than the project", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    writeFileSync(join(worktreePath, "so-na-worktree.txt"), "x");

    const listing = await ctx.api.files.listDir({
      scopeType: "worktree",
      scopeId: worktreeId,
      path: "",
    });

    expect(listing.entries.map((entry) => entry.name)).toContain("so-na-worktree.txt");
  });

  it("defaults to the root when no path is given", async () => {
    const { context: ctx, projectId } = await setup();

    const listing = await ctx.api.files.listDir({ scopeType: "project", scopeId: projectId });

    expect(listing.path).toBe("");
  });

  it("refuses a path that escapes the checkout", async () => {
    const { context: ctx, projectId } = await setup();

    await expect(
      ctx.api.files.listDir({ scopeType: "project", scopeId: projectId, path: "src/../.." }),
    ).rejects.toThrow(/sai do checkout/);
  });

  it("refuses a symlink pointing outside, and says why", async () => {
    const { context: ctx, projectId, repo } = await setup();
    const outside = tempDir("lumem-outside-");
    writeFileSync(join(outside, "id_rsa"), "PRIVATE KEY");
    symlinkSync(outside, join(repo, "chaves"));

    await expect(
      ctx.api.files.read({ scopeType: "project", scopeId: projectId, path: "chaves/id_rsa" }),
    ).rejects.toThrow(/aponta para fora do checkout/);
  });

  it("reports an unknown scope as not found", async () => {
    const { context: ctx } = await setup();

    await expect(
      ctx.api.files.listDir({ scopeType: "worktree", scopeId: "wt_inexistente" }),
    ).rejects.toThrow(/não existe/);
  });

  it("reports a checkout that vanished from disk instead of an ENOENT", async () => {
    const { context: ctx, worktreeId, worktreePath } = await setup();
    rmSync(worktreePath, { recursive: true, force: true });

    await expect(
      ctx.api.files.listDir({ scopeType: "worktree", scopeId: worktreeId }),
    ).rejects.toThrow(/o checkout não está em/);
  });
});

describe("files.read", () => {
  it("returns the file's text", async () => {
    const { context: ctx, projectId } = await setup();

    const content = await ctx.api.files.read({
      scopeType: "project",
      scopeId: projectId,
      path: "src/lore/loader.ts",
    });

    expect(content).toMatchObject({ kind: "text", lines: 1 });
    expect(content.kind === "text" && content.text).toBe("const a = 1;\n");
  });

  it("reports a file that is not there", async () => {
    const { context: ctx, projectId } = await setup();

    await expect(
      ctx.api.files.read({ scopeType: "project", scopeId: projectId, path: "nao-existe.ts" }),
    ).rejects.toThrow(/não existe no checkout/);
  });
});
