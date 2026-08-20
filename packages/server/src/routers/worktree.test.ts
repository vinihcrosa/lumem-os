import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

/** A workspace, a real repository registered in it, and somewhere to put worktrees. */
async function setup(): Promise<{ context: TestCaller; projectId: string; repo: string }> {
  const worktreesRoot = tempDir("lumem-state-");
  context = createTestCaller({ LUMEM_STATE_DIR: worktreesRoot });
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lorebase",
  });
  return { context, projectId: project.id, repo };
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("worktree.create", () => {
  it("creates the checkout under the state directory and registers it", async () => {
    const { context: ctx, projectId } = await setup();

    const created = await ctx.api.worktree.create({ projectId, name: "teste" });

    // F4.4: ~/.lumem/worktrees/<projeto>/<nome>, outside the repository.
    expect(created.path).toBe(join(ctx.config.worktreesDir, "lorebase", "teste"));
    expect(existsSync(join(created.path, "README.md"))).toBe(true);
    expect(created).toMatchObject({ branch: "teste", state: "active", present: true });
  });

  it("shows up in the original repository's worktree list", async () => {
    const { context: ctx, projectId, repo } = await setup();

    await ctx.api.worktree.create({ projectId, name: "teste" });

    expect(await runGit(repo, "worktree", "list")).toContain("teste");
  });

  it("cuts the branch from the project's recorded default", async () => {
    // F4.3, and no fetch: whatever was resolved when the project was added.
    const { context: ctx, projectId, repo } = await setup();
    await runGit(repo, "checkout", "-b", "outra");
    writeFileSync(join(repo, "only-on-outra.txt"), "x");
    await runGit(repo, "add", "only-on-outra.txt");
    await runGit(repo, "commit", "-m", "outra");

    const created = await ctx.api.worktree.create({ projectId, name: "teste" });

    expect(existsSync(join(created.path, "only-on-outra.txt"))).toBe(false);
  });

  it("refuses a branch that already exists and registers nothing", async () => {
    const { context: ctx, projectId } = await setup();

    const failure = ctx.api.worktree.create({ projectId, name: "main" });

    await expect(failure).rejects.toThrow(/já existe; escolha outro nome/);
    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
  });

  it("supports a name with a slash", async () => {
    const { context: ctx, projectId } = await setup();

    const created = await ctx.api.worktree.create({ projectId, name: "feat/login" });

    expect(created.path).toBe(join(ctx.config.worktreesDir, "lorebase", "feat", "login"));
    expect(existsSync(join(created.path, "README.md"))).toBe(true);
  });

  it.each([
    ["a name that escapes the directory", "../fora"],
    ["a name starting with a dash", "-rf"],
    ["a name with a space", "com espaço"],
    ["an empty name", "   "],
  ])("refuses %s", async (_label, name) => {
    const { context: ctx, projectId } = await setup();

    await expect(ctx.api.worktree.create({ projectId, name })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("registers nothing when git fails", async () => {
    // PRD §8. Here the repository itself is gone from under the registration.
    const { context: ctx, projectId, repo } = await setup();
    rmSync(repo, { recursive: true, force: true });

    await expect(ctx.api.worktree.create({ projectId, name: "teste" })).rejects.toThrow();

    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
  });

  it("leaves no checkout behind when the registry refuses", async () => {
    // The reverse order of failure: git succeeded, the database did not. A
    // directory the daemon does not know about is one it can never clean up.
    const { context: ctx, projectId, repo } = await setup();
    await ctx.api.worktree.create({ projectId, name: "teste" });
    // Same name, but git no longer objects: the branch was deleted by hand.
    await ctx.api.worktree.remove({ id: (await ctx.api.worktree.listByProject({ projectId }))[0]!.id });
    await runGit(repo, "branch", "-D", "teste");
    const registered = await ctx.api.worktree.create({ projectId, name: "teste" });
    await runGit(repo, "worktree", "remove", "--force", registered.path);
    await runGit(repo, "branch", "-D", "teste");

    const failure = ctx.api.worktree.create({ projectId, name: "teste" });

    await expect(failure).rejects.toMatchObject({ code: "CONFLICT" });
    expect(existsSync(registered.path)).toBe(false);
  });

  it("reports a project that does not exist", async () => {
    const { context: ctx } = await setup();

    await expect(
      ctx.api.worktree.create({ projectId: "ghost", name: "teste" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("worktree.listByProject", () => {
  it("returns name, branch, path and state", async () => {
    const { context: ctx, projectId } = await setup();
    await ctx.api.worktree.create({ projectId, name: "teste" });

    const [listed] = await ctx.api.worktree.listByProject({ projectId });

    expect(listed).toMatchObject({ name: "teste", branch: "teste", state: "active", present: true });
    expect(listed?.path).toContain("teste");
  });

  it("reports a directory deleted by hand as absent", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    rmSync(created.path, { recursive: true, force: true });

    const [listed] = await ctx.api.worktree.listByProject({ projectId });

    expect(listed?.present).toBe(false);
  });
});

describe("worktree.getDetail", () => {
  it("reports a fresh worktree as clean and level with the base", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });

    const detail = await ctx.api.worktree.getDetail({ id: created.id });

    // F4.10: branch, path, cleanliness and distance from the base.
    expect(detail).toMatchObject({
      branch: "teste",
      path: created.path,
      baseBranch: "main",
      status: { clean: true, changedFiles: 0 },
      aheadBehind: { ahead: 0, behind: 0 },
    });
  });

  it("counts the modified files", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    writeFileSync(join(created.path, "README.md"), "changed");
    writeFileSync(join(created.path, "novo.txt"), "x");

    const detail = await ctx.api.worktree.getDetail({ id: created.id });

    expect(detail.status).toEqual({ clean: false, changedFiles: 2 });
  });

  it("counts commits ahead of the base", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    writeFileSync(join(created.path, "a.txt"), "x");
    await runGit(created.path, "add", "a.txt");
    await runGit(created.path, "commit", "-m", "work");

    expect((await ctx.api.worktree.getDetail({ id: created.id })).aheadBehind).toEqual({
      ahead: 1,
      behind: 0,
    });
  });

  it("still answers when the directory is gone", async () => {
    // Failing the whole panel would hide the branch and path the user needs to
    // decide what to do about it.
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    rmSync(created.path, { recursive: true, force: true });

    const detail = await ctx.api.worktree.getDetail({ id: created.id });

    expect(detail).toMatchObject({ present: false, status: null, aheadBehind: null });
    expect(detail.branch).toBe("teste");
  });

  it("reports a worktree that does not exist", async () => {
    const { context: ctx } = await setup();

    await expect(ctx.api.worktree.getDetail({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("worktree.remove", () => {
  it("removes a clean worktree from disk and registry, keeping the branch", async () => {
    const { context: ctx, projectId, repo } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });

    await ctx.api.worktree.remove({ id: created.id });

    expect(existsSync(created.path)).toBe(false);
    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
    // F4.7: the work stays reachable.
    expect(await ctx.git.branchExists(repo, "teste")).toBe(true);
  });

  it("blocks a dirty worktree and says how many files", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    writeFileSync(join(created.path, "README.md"), "changed");
    writeFileSync(join(created.path, "novo.txt"), "x");

    const failure = ctx.api.worktree.remove({ id: created.id });

    await expect(failure).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(failure).rejects.toThrow(/2 arquivo\(s\) modificado\(s\)/);
    expect(existsSync(created.path)).toBe(true);
  });

  it("removes a dirty worktree when the user confirms", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    writeFileSync(join(created.path, "README.md"), "changed");

    await ctx.api.worktree.remove({ id: created.id, force: true });

    expect(existsSync(created.path)).toBe(false);
    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
  });

  it("drops the registration of a directory already gone", async () => {
    // The recovery path for a worktree someone deleted with rm -rf.
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    rmSync(created.path, { recursive: true, force: true });

    await ctx.api.worktree.remove({ id: created.id });

    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
  });

  it("frees the project to be removed", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    await expect(ctx.api.project.remove({ id: projectId })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await ctx.api.worktree.remove({ id: created.id });

    await expect(ctx.api.project.remove({ id: projectId })).resolves.toEqual({ ok: true });
  });

  it("reports a worktree that does not exist", async () => {
    const { context: ctx } = await setup();

    await expect(ctx.api.worktree.remove({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("worktree.plan", () => {
  it("previews the path, the branch, the base and the command", async () => {
    const { context: ctx, projectId } = await setup();

    const plan = await ctx.api.worktree.plan({ projectId, name: "primeira-tarefa" });

    expect(plan.branch).toBe("primeira-tarefa");
    expect(plan.path).toContain("primeira-tarefa");
    expect(plan.baseBranch).toBe("main");
    expect(plan.baseSha).toMatch(/^[0-9a-f]{7,}$/);
    expect(plan.refusal).toBeNull();
  });

  it("shows the command that will actually run", async () => {
    // Onboarding O13: it is ferramenta de dev, and it makes the screen auditable
    // — if the result surprises you, the command was on screen. Which is why it
    // is built where it is executed, not assembled a second time in the client.
    const { context: ctx, projectId } = await setup();

    const plan = await ctx.api.worktree.plan({ projectId, name: "tarefa" });

    expect(plan.command).toBe(`git worktree add -b tarefa ${plan.path} main`);
  });

  it("writes nothing", async () => {
    const { context: ctx, projectId } = await setup();

    await ctx.api.worktree.plan({ projectId, name: "tarefa" });

    expect(await ctx.api.worktree.listByProject({ projectId })).toHaveLength(0);
  });

  it("says the branch is taken before the creation does", async () => {
    // Cheaper before: the refusal costs a keystroke here and a failed
    // `worktree add` there.
    const { context: ctx, projectId } = await setup();
    await ctx.api.worktree.create({ projectId, name: "ja-existe" });

    const plan = await ctx.api.worktree.plan({ projectId, name: "ja-existe" });

    expect(plan.refusal).toMatch(/já existe/);
  });

  it("refuses a name git would not take, with the rule that refused it", async () => {
    const { context: ctx, projectId } = await setup();

    await expect(ctx.api.worktree.plan({ projectId, name: "com espaço" })).rejects.toThrow(
      /caracteres/,
    );
  });

  it("reports a project that does not exist", async () => {
    const { context: ctx } = await setup();

    await expect(ctx.api.worktree.plan({ projectId: "nope", name: "tarefa" })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });
});
