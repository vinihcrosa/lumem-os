import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listSignals } from "../memory/signals.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";
import type { PrHost } from "../pr/PrHost.js";

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

    // F6.12: ~/.lumem/workspaces/<workspace>/<projeto>/worktrees/<nome>, one
    // tree for the whole hierarchy, and outside the repository as F4.4 wants.
    expect(created.path).toBe(join(ctx.config.workspacesDir, "pessoal", "lorebase", "worktrees", "teste"));
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

    expect(created.path).toBe(join(ctx.config.workspacesDir, "pessoal", "lorebase", "worktrees", "feat", "login"));
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

  it("drops only its own registration, leaving the project and its siblings", async () => {
    // Removing a project cascades to its worktrees (F2.5, WS-Q22); the reverse
    // is not true — removing one worktree leaves the project and the others.
    const { context: ctx, projectId } = await setup();
    const a = await ctx.api.worktree.create({ projectId, name: "a" });
    await ctx.api.worktree.create({ projectId, name: "b" });

    await ctx.api.worktree.remove({ id: a.id });

    expect((await ctx.api.worktree.listByProject({ projectId })).map((w) => w.name)).toEqual(["b"]);
    expect(await ctx.api.project.get({ id: projectId })).not.toBeNull();
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

describe("worktree.remove e o sinal de ação (Q17)", () => {
  it("registra o descarte, e o `detail` diz que ela saiu limpa", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });

    await ctx.api.worktree.remove({ id: created.id });

    const [signal] = listSignals(ctx.db, { kind: "worktree_discarded" });
    // O alvo é o id, não o nome da branch: nome é frase que você digitou.
    expect(signal?.target).toBe(created.id);
    expect(signal?.projectId).toBe(projectId);
    expect(signal?.detail).toBe(0);
  });

  it("`detail` separa 'terminei' de 'desisti'", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    writeFileSync(join(created.path, "README.md"), "changed");

    await ctx.api.worktree.remove({ id: created.id, force: true });

    expect(listSignals(ctx.db, { kind: "worktree_discarded" })[0]?.detail).toBe(1);
  });

  it("uma remoção recusada não descartou nada, e não vira sinal", async () => {
    const { context: ctx, projectId } = await setup();
    const created = await ctx.api.worktree.create({ projectId, name: "teste" });
    writeFileSync(join(created.path, "novo.txt"), "x");

    await expect(ctx.api.worktree.remove({ id: created.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(listSignals(ctx.db)).toHaveLength(0);
  });
});

/**
 * Um host de git de mentira, com as PRs e as issues que o teste quiser.
 *
 * O `gh` de verdade fala com a rede e com a conta de alguém — a mesma razão de
 * `testing.md` que já vale para a barra de PR. O que muda aqui é o que se
 * exercita: **de onde o daemon tira o `headRefName`**. Ele nunca vem do cliente
 * (§4.2.12 da `pull-request-status`), e este dublê é o que prova isso.
 */
function hostWith(options: {
  pulls?: { number: number; headRefName: string; title?: string; crossRepository?: boolean }[];
  issues?: { number: number; title: string }[];
}): PrHost {
  const pulls = (options.pulls ?? []).map((pull) => ({
    number: pull.number,
    url: `https://github.com/exemplo/repo/pull/${pull.number}`,
    title: pull.title ?? `pr ${pull.number}`,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefName: pull.headRefName,
    baseRefName: "main",
    crossRepository: pull.crossRepository ?? false,
    updatedAt: "2026-09-07T00:00:00Z",
    mergedAt: null,
    closedAt: null,
    author: "alguem",
    reviews: [],
    checks: [],
  }));

  return {
    name: "GitHub",
    supports: () => true,
    read: () =>
      Promise.resolve({
        ok: true,
        snapshot: {
          host: "github.com",
          repo: "exemplo/repo",
          pulls,
          merge: { merge: true, squash: true, rebase: false, deleteBranchOnMerge: false },
          readAt: new Date().toISOString(),
        },
      }),
    issues: () =>
      Promise.resolve({
        ok: true,
        issues: (options.issues ?? []).map((issue) => ({
          ...issue,
          state: "OPEN",
          url: `https://github.com/exemplo/repo/issues/${issue.number}`,
          updatedAt: "2026-09-07T00:00:00Z",
          author: "alguem",
          labels: [],
        })),
      }),
    create: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
    merge: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
  } as unknown as PrHost;
}

/** Um projeto cujo repositório tem um remoto de verdade — outro repositório em disco. */
async function setupWithRemote(
  branches: string[],
  host?: PrHost,
): Promise<{ context: TestCaller; projectId: string; repo: string; remote: string }> {
  const remote = await createRepo({ branch: "main" });
  for (const branch of branches) await runGit(remote, "branch", branch);

  const worktreesRoot = tempDir("lumem-state-");
  context = createTestCaller(
    { LUMEM_STATE_DIR: worktreesRoot },
    host === undefined ? {} : { prHost: host },
  );
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  await runGit(repo, "remote", "add", "origin", remote);
  await runGit(repo, "fetch", "origin");
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lorebase",
  });
  return { context, projectId: project.id, repo, remote };
}

describe("worktree.create com origem", () => {
  it("sem `from`, faz exatamente o que sempre fez", async () => {
    // A regressão vive junto da mudança de propósito: este é o gesto mais usado
    // do produto, e ele não pode virar dano colateral de uma feature nova.
    const { context: ctx, projectId } = await setup();

    const created = await ctx.api.worktree.create({ projectId, name: "teste" });

    expect(created).toMatchObject({ name: "teste", branch: "teste" });
    expect(existsSync(join(created.path, "README.md"))).toBe(true);
  });

  it("de uma branch local que já existe, o nome e a branch divergem", async () => {
    // Q9: primeira vez no produto. O nome é da worktree, a branch é a que existe.
    const { context: ctx, projectId, repo } = await setup();
    await runGit(repo, "branch", "feature-a");

    const created = await ctx.api.worktree.create({
      projectId,
      name: "trabalho",
      from: { kind: "branch", ref: "feature-a" },
    });

    expect(created).toMatchObject({ name: "trabalho", branch: "feature-a" });
    expect((await runGit(created.path, "branch", "--show-current")).trim()).toBe("feature-a");
  });

  it("de uma branch remota, cria a local rastreando — e sem HEAD destacado", async () => {
    const { context: ctx, projectId } = await setupWithRemote(["feature-a"]);

    const created = await ctx.api.worktree.create({
      projectId,
      name: "feature-a",
      // Sem `remote` no pedido: quem decide entre local e publicada, e qual
      // remoto, é o daemon — o cliente manda só o nome da ref.
      from: { kind: "branch", ref: "feature-a" },
    });

    expect((await runGit(created.path, "branch", "--show-current")).trim()).toBe("feature-a");
    expect((await runGit(created.path, "rev-parse", "--abbrev-ref", "@{u}")).trim()).toBe(
      "origin/feature-a",
    );
  });

  it("de uma PR, tira o headRefName do daemon e não do cliente", async () => {
    const { context: ctx, projectId } = await setupWithRemote(
      ["feature-a"],
      hostWith({ pulls: [{ number: 19, headRefName: "feature-a" }] }),
    );

    const created = await ctx.api.worktree.create({
      projectId,
      name: "pr-19",
      from: { kind: "pr", number: 19 },
    });

    expect(created.branch).toBe("pr-19");
    expect((await runGit(created.path, "rev-parse", "--abbrev-ref", "@{u}")).trim()).toBe(
      "origin/feature-a",
    );
  });

  it("busca a head que não está no clone, e então corta dela", async () => {
    /*
     * A Q2 revertida (ADR de 2026-09-08). O remoto é outro repositório em disco,
     * e a branch existe **lá** e não aqui: o `setupWithRemote` só busca o que
     * existia na hora do clone.
     */
    const { context: ctx, projectId, remote } = await setupWithRemote(
      [],
      hostWith({ pulls: [{ number: 20, headRefName: "publicada-depois" }] }),
    );
    // Publicada depois do fetch inicial — o caso que produzia o vermelho.
    await runGit(remote, "branch", "publicada-depois");

    const created = await ctx.api.worktree.create({
      projectId,
      name: "pr-20",
      from: { kind: "pr", number: 20 },
    });

    expect((await runGit(created.path, "branch", "--show-current")).trim()).toBe("pr-20");
    expect((await runGit(created.path, "rev-parse", "--abbrev-ref", "@{u}")).trim()).toBe(
      "origin/publicada-depois",
    );
  });

  it("quando a busca falha, nada é criado e a mensagem é a do git", async () => {
    const { context: ctx, projectId } = await setupWithRemote(
      [],
      hostWith({ pulls: [{ number: 21, headRefName: "nao-existe-em-lugar-nenhum" }] }),
    );

    const failure = ctx.api.worktree.create({
      projectId,
      name: "pr-21",
      from: { kind: "pr", number: 21 },
    });

    await expect(failure).rejects.toThrow(/não deu para buscar a branch da PR #21/);
    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
  });

  it("recusa uma PR que o daemon não conhece", async () => {
    const { context: ctx, projectId } = await setupWithRemote(["feature-a"], hostWith({}));

    await expect(
      ctx.api.worktree.create({ projectId, name: "pr-99", from: { kind: "pr", number: 99 } }),
    ).rejects.toThrow(/99/);
  });

  it("de uma issue, corta da default com o nome que veio no pedido", async () => {
    const { context: ctx, projectId, repo } = await setup();
    await runGit(repo, "checkout", "-b", "outra");
    writeFileSync(join(repo, "so-na-outra.txt"), "x");
    await runGit(repo, "add", "so-na-outra.txt");
    await runGit(repo, "commit", "-m", "outra");

    const created = await ctx.api.worktree.create({
      projectId,
      name: "52-worktree-from",
      from: { kind: "issue", number: 52 },
    });

    expect(created.branch).toBe("52-worktree-from");
    expect(existsSync(join(created.path, "so-na-outra.txt"))).toBe(false);
  });
});

describe("worktree.branches", () => {
  it("responde local e remota sem tocar no host", async () => {
    const { context: ctx, projectId } = await setupWithRemote(["feature-a"]);

    const branches = await ctx.api.worktree.branches({ projectId });
    const byName = new Map(branches.map((branch) => [branch.name, branch]));

    expect(byName.get("feature-a")).toMatchObject({ local: false, remotes: ["origin"] });
    expect(byName.get("main")).toMatchObject({ local: true });
  });

  it("diz qual worktree ocupa a branch, pelo nome que o produto usa", async () => {
    const { context: ctx, projectId } = await setup();
    await ctx.api.worktree.create({ projectId, name: "ocupada" });

    const entry = (await ctx.api.worktree.branches({ projectId })).find(
      (branch) => branch.name === "ocupada",
    );

    expect(entry?.worktreeName).toBe("ocupada");
  });
});

describe("worktree.hostOrigins", () => {
  it("junta issues e PRs, e marca a head que não está no disco", async () => {
    const { context: ctx, projectId } = await setupWithRemote(
      ["feature-a"],
      hostWith({
        pulls: [
          { number: 19, headRefName: "feature-a" },
          { number: 20, headRefName: "nunca-buscada" },
        ],
        issues: [{ number: 52, title: "de onde cortar" }],
      }),
    );

    const origins = await ctx.api.worktree.hostOrigins({ projectId });

    expect(origins.issues?.items).toHaveLength(1);
    expect(origins.pulls?.items).toEqual([
      expect.objectContaining({ number: 19, headRefName: "feature-a", onDisk: true }),
      expect.objectContaining({ number: 20, onDisk: false }),
    ]);
  });

  it("num projeto sem remoto, responde sem host e sem executar nada", async () => {
    const { context: ctx, projectId } = await setup();

    const origins = await ctx.api.worktree.hostOrigins({ projectId });

    expect(origins.host).toBeNull();
    expect(origins.issues?.failure).toMatchObject({ kind: "unsupported-host" });
  });
});

describe("worktree.plan com origem", () => {
  it("mostra o comando que vai rodar, e não um parecido", async () => {
    // T10: o preview montava a string à mão. Com origem, isso é um preview de
    // um comando que não existe.
    const { context: ctx, projectId, repo } = await setup();
    await runGit(repo, "branch", "feature-a");

    const plan = await ctx.api.worktree.plan({
      projectId,
      name: "trabalho",
      from: { kind: "branch", ref: "feature-a" },
    });

    expect(plan.branch).toBe("feature-a");
    expect(plan.baseBranch).toBe("feature-a");
    expect(plan.command).toBe(`git worktree add ${plan.path} feature-a`);
  });

  it("da branch remota, mostra o --track que evita o HEAD destacado", async () => {
    const { context: ctx, projectId } = await setupWithRemote(["feature-a"]);

    const plan = await ctx.api.worktree.plan({
      projectId,
      name: "trabalho",
      from: { kind: "branch", ref: "feature-a" },
    });

    expect(plan.command).toBe(
      `git worktree add --track -b trabalho ${plan.path} origin/feature-a`,
    );
  });

  it("sem origem, continua dizendo o mesmo de sempre", async () => {
    const { context: ctx, projectId } = await setup();

    const plan = await ctx.api.worktree.plan({ projectId, name: "teste" });

    expect(plan.command).toBe(`git worktree add -b teste ${plan.path} main`);
  });
});

describe("o que a review da PR 75 achou", () => {
  it("prefere `origin` mesmo quando outro remoto vem antes por refname", async () => {
    // `for-each-ref` ordena por refname, então `fork` vem antes de `origin`. A
    // tela mandava `remotes[0]` e o router preferia `origin`: a mesma branch
    // rastreava repositórios diferentes conforme a aba por onde se chegava nela.
    const { context: ctx, projectId, repo, remote } = await setupWithRemote(["feature-a"]);
    await runGit(repo, "remote", "add", "fork", remote);
    await runGit(repo, "fetch", "fork");

    const created = await ctx.api.worktree.create({
      projectId,
      name: "de-origin",
      from: { kind: "branch", ref: "feature-a" },
    });

    expect((await runGit(created.path, "rev-parse", "--abbrev-ref", "@{u}")).trim()).toBe(
      "origin/feature-a",
    );
  });

  it("uma PR de fork ignora a branch homônima e busca `refs/pull/<n>/head`", async () => {
    /*
     * `headRefName` de uma PR cruzada é o nome no fork. `patch-1` do fork de
     * alguém e `origin/patch-1` do upstream são coisas diferentes — este teste
     * põe as duas em disco com **conteúdos diferentes** e confere que a worktree
     * saiu da PR, e não da homônima.
     */
    const { context: ctx, projectId, repo, remote } = await setupWithRemote(
      [],
      hostWith({ pulls: [{ number: 42, headRefName: "patch-1", crossRepository: true }] }),
    );

    // O que o host serve como head da PR 42.
    await runGit(remote, "checkout", "-b", "do-fork");
    writeFileSync(join(remote, "so-na-pr.txt"), "x");
    await runGit(remote, "add", "so-na-pr.txt");
    await runGit(remote, "commit", "-m", "a head da PR");
    await runGit(remote, "update-ref", "refs/pull/42/head", "do-fork");
    await runGit(remote, "checkout", "main");
    // E a homônima do upstream, que não tem nada a ver com ela.
    await runGit(repo, "update-ref", "refs/remotes/origin/patch-1", "main");

    const created = await ctx.api.worktree.create({
      projectId,
      name: "da-42",
      from: { kind: "pr", number: 42 },
    });

    expect(existsSync(join(created.path, "so-na-pr.txt"))).toBe(true);
    // Sem upstream, de propósito: o fork não é o destino do trabalho.
    await expect(runGit(created.path, "rev-parse", "--abbrev-ref", "@{u}")).rejects.toThrow();
  });

  it("a PR de fork chega à tela marcada — agora como espera, não como recusa", async () => {
    const { context: ctx, projectId, repo } = await setupWithRemote(
      [],
      hostWith({ pulls: [{ number: 42, headRefName: "patch-1", crossRepository: true }] }),
    );
    await runGit(repo, "update-ref", "refs/remotes/origin/patch-1", "main");

    const origins = await ctx.api.worktree.hostOrigins({ projectId });

    expect(origins.pulls?.items[0]).toMatchObject({ crossRepository: true, onDisk: false });
  });

  it("recusa uma branch que não está no disco em vez de deixar o git aceitar", async () => {
    const { context: ctx, projectId } = await setupWithRemote([]);

    await expect(
      ctx.api.worktree.create({
        projectId,
        name: "fantasma",
        from: { kind: "branch", ref: "nunca-existiu" },
      }),
    ).rejects.toThrow(/não está no disco/);
  });

  it("o preview emparelha o sha com a origem escolhida, e não com o HEAD do principal", async () => {
    // O `baseBranch` já saía da origem; o `baseSha` continuava sendo o do
    // checkout principal. O par ficava consistente por acidente e só na default.
    const { context: ctx, projectId, repo } = await setup();
    await runGit(repo, "checkout", "-b", "feature-a");
    writeFileSync(join(repo, "so-na-feature.txt"), "x");
    await runGit(repo, "add", "so-na-feature.txt");
    await runGit(repo, "commit", "-m", "feature");
    await runGit(repo, "checkout", "main");

    const [plan, esperado] = await Promise.all([
      ctx.api.worktree.plan({ projectId, name: "x", from: { kind: "branch", ref: "feature-a" } }),
      runGit(repo, "rev-parse", "--short", "feature-a"),
    ]);

    expect(plan.baseBranch).toBe("feature-a");
    expect(plan.baseSha).toBe(esperado.trim());
  });
});
