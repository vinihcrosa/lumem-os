import { rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { registerProject, resolveAvailableName } from "./project.js";
import {
  cleanupGitFixtures,
  createPlainDir,
  createRepo,
  createSubdir,
  tempDir,
} from "../testing/git-fixtures.js";

let context: TestCaller;

async function setup(): Promise<{ context: TestCaller; workspaceId: string }> {
  context = createTestCaller();
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  return { context, workspaceId: workspace.id };
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("project.add", () => {
  it("registers a repository and resolves its default branch", async () => {
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo({ branch: "principal" });

    const added = await ctx.api.project.add({ workspaceId, path: repo });

    expect(added).toMatchObject({ path: repo, defaultBranch: "principal", available: true });
  });

  it("names the project after the directory by default", async () => {
    // F2.3. The user typed a path; making them type the name again is friction
    // for nothing.
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo();

    const added = await ctx.api.project.add({ workspaceId, path: repo });

    expect(added.name).toBe(basename(repo));
  });

  it("accepts an explicit name", async () => {
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo();

    expect(await ctx.api.project.add({ workspaceId, path: repo, name: "lorebase" })).toMatchObject({
      name: "lorebase",
    });
  });

  it.each([
    ["a path that does not exist", async () => "/definitely-not-here-xyz", /não existe/],
    ["a directory that is not a repository", async () => createPlainDir(), /não é um repositório/],
    [
      "a subdirectory of a repository",
      async () => createSubdir(await createRepo()),
      /não é a raiz/,
    ],
  ])("refuses %s, saying which check failed", async (_label, makePath, expected) => {
    // F2.2: the user is told *which* validation failed, not that something was
    // wrong.
    const { context: ctx, workspaceId } = await setup();

    const failure = ctx.api.project.add({ workspaceId, path: await makePath() });

    await expect(failure).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(failure).rejects.toThrow(expected);
  });

  it("refuses a path that is a file", async () => {
    const { context: ctx, workspaceId } = await setup();
    const file = join(tempDir(), "README.md");
    writeFileSync(file, "not a directory");

    await expect(ctx.api.project.add({ workspaceId, path: file })).rejects.toThrow(
      /não é um diretório/,
    );
  });

  it("refuses a relative path", async () => {
    const { context: ctx, workspaceId } = await setup();

    await expect(ctx.api.project.add({ workspaceId, path: "./relative" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("registers nothing when validation fails", async () => {
    // PRD §8, and the reason validation runs before the insert rather than
    // beside it.
    const { context: ctx, workspaceId } = await setup();

    await expect(
      ctx.api.project.add({ workspaceId, path: createPlainDir() }),
    ).rejects.toThrow();

    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
  });

  it("registers nothing when the branch cannot be resolved", async () => {
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo();
    // A detached HEAD: valid repository, no branch to cut worktrees from.
    const { runGit } = await import("../testing/git-fixtures.js");
    const head = (await runGit(repo, "rev-parse", "HEAD")).trim();
    await runGit(repo, "checkout", "--detach", head);

    await expect(ctx.api.project.add({ workspaceId, path: repo })).rejects.toThrow(
      /HEAD está destacado/,
    );
    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
  });

  it("refuses a repository already registered", async () => {
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo();
    await ctx.api.project.add({ workspaceId, path: repo });

    await expect(
      ctx.api.project.add({ workspaceId, path: repo, name: "outro" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reports a workspace that does not exist", async () => {
    const { context: ctx } = await setup();
    const repo = await createRepo();

    await expect(
      ctx.api.project.add({ workspaceId: "ghost", path: repo }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("project.listByWorkspace", () => {
  it("lists the projects of that workspace", async () => {
    const { context: ctx, workspaceId } = await setup();
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "zeta" });
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "alfa" });

    expect((await ctx.api.project.listByWorkspace({ workspaceId })).map((p) => p.name)).toEqual([
      "alfa",
      "zeta",
    ]);
  });

  it("marks a project whose repository left the disk as unavailable", async () => {
    // PRD §8: it does not vanish from the sidebar. The registration is the
    // user's, and deleting it for them would lose the worktrees too.
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo();
    await ctx.api.project.add({ workspaceId, path: repo });

    rmSync(repo, { recursive: true, force: true });

    const [listed] = await ctx.api.project.listByWorkspace({ workspaceId });
    expect(listed).toMatchObject({ path: repo, available: false });
  });

  it("is empty for a workspace with nothing in it", async () => {
    const { context: ctx, workspaceId } = await setup();

    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
  });
});

describe("project.get", () => {
  it("returns null for an unknown id", async () => {
    const { context: ctx } = await setup();

    expect(await ctx.api.project.get({ id: "nope" })).toBeNull();
  });
});

describe("project.rename", () => {
  it("renames", async () => {
    const { context: ctx, workspaceId } = await setup();
    const added = await ctx.api.project.add({ workspaceId, path: await createRepo() });

    expect(await ctx.api.project.rename({ id: added.id, name: "lore" })).toMatchObject({
      name: "lore",
    });
  });

  it("refuses a name another project already has", async () => {
    const { context: ctx, workspaceId } = await setup();
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "lorebase" });
    const other = await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "x" });

    await expect(ctx.api.project.rename({ id: other.id, name: "lorebase" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("project.remove", () => {
  it("drops the registration and leaves the repository alone", async () => {
    // F2.5. Deleting someone's repository because they removed it from a
    // sidebar would be unforgivable.
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo();
    const added = await ctx.api.project.add({ workspaceId, path: repo });

    await ctx.api.project.remove({ id: added.id });

    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
    expect(await ctx.api.project.get({ id: added.id })).toBeNull();
    const check = await ctx.git.isGitRepo(repo);
    expect(check.ok).toBe(true);
  });

  it("reports an unknown project as not found", async () => {
    const { context: ctx } = await setup();

    await expect(ctx.api.project.remove({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("registerProject", () => {
  it("é o mesmo caminho que o project.add percorre", async () => {
    // A5. Duas rotinas de registro seriam duas definições de "projeto válido",
    // e a segunda ficaria para trás na primeira vez que a primeira mudasse. A
    // prova de que continua sendo uma só são os testes acima, que passam sem
    // edição depois da extração.
    const { context: ctx, workspaceId } = await setup();
    const repo = await createRepo({ branch: "main" });

    const registrado = await registerProject(ctx.ctx, {
      workspaceId,
      path: repo,
      name: "clonado",
      remoteUrl: "https://github.com/org/clonado.git",
      managed: true,
    });

    expect(registrado).toMatchObject({
      name: "clonado",
      defaultBranch: "main",
      remoteUrl: "https://github.com/org/clonado.git",
      managed: true,
      available: true,
    });
  });

  it("recusa um diretório que não é raiz de repositório, venha de onde vier", async () => {
    // O clone não ganha desconto por ter dado trabalho.
    const { context: ctx, workspaceId } = await setup();

    await expect(
      registerProject(ctx.ctx, {
        workspaceId,
        path: createPlainDir(),
        name: "clonado",
        managed: true,
      }),
    ).rejects.toThrow(/não é um repositório git/);
  });

  it("nunca marca como gerenciado o que foi registrado por caminho", async () => {
    // A12: não há caminho pelo qual um projeto vindo do disco do usuário vire
    // um que o daemon pode apagar.
    const { context: ctx, workspaceId } = await setup();

    const added = await ctx.api.project.add({ workspaceId, path: await createRepo() });

    expect(added).toMatchObject({ managed: false, remoteUrl: null });
  });
});

describe("resolveAvailableName", () => {
  it("devolve o nome pedido quando ele está livre", async () => {
    const { context: ctx, workspaceId } = await setup();

    expect(await resolveAvailableName(ctx.ctx, workspaceId, "api")).toBe("api");
  });

  it("sufixa quando o nome já existe, em vez de jogar o clone fora", async () => {
    // F6.4. Renomear se desfaz com um clique; o download de 4 GiB, não.
    const { context: ctx, workspaceId } = await setup();
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api" });

    expect(await resolveAvailableName(ctx.ctx, workspaceId, "api")).toBe("api-2");
  });

  it("continua procurando enquanto os sufixos estiverem tomados", async () => {
    const { context: ctx, workspaceId } = await setup();
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api" });
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api-2" });

    expect(await resolveAvailableName(ctx.ctx, workspaceId, "api")).toBe("api-3");
  });

  it("não confunde workspaces diferentes", async () => {
    const { context: ctx, workspaceId } = await setup();
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api" });
    const outro = await ctx.api.workspace.create({ name: "trabalho" });

    expect(await resolveAvailableName(ctx.ctx, outro.id, "api")).toBe("api");
  });
});
