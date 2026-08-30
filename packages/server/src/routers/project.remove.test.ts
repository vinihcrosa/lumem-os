import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createProjectRepository } from "../repositories/project.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";
import type { CloneJob } from "../git/CloneJobStore.js";

let context: TestCaller;

async function setup(): Promise<{ ctx: TestCaller; workspaceId: string }> {
  context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  return { ctx: context, workspaceId: workspace.id };
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

async function untilDone(ctx: TestCaller, jobId: string): Promise<CloneJob> {
  const controller = new AbortController();
  let last: CloneJob | undefined;
  for await (const job of ctx.ctx.clones.subscribe(jobId, controller.signal)) last = job;
  return last!;
}

/** A cloned, managed project, sitting where the daemon put it. */
async function cloned(ctx: TestCaller, workspaceId: string, name = "api") {
  const origem = await createRepo();
  const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}`, name });
  await untilDone(ctx, job.id);
  const project = (await ctx.api.project.listByWorkspace({ workspaceId })).find(
    (row) => row.name === name,
  );
  return project!;
}

describe("project.remove, projeto gerenciado", () => {
  it("apaga o diretório e some com o registro", async () => {
    // F6.9. Reverte o F2.5 do walking-skeleton para exatamente uma classe de
    // projeto: aquela cujos bytes o daemon escreveu.
    const { ctx, workspaceId } = await setup();
    const project = await cloned(ctx, workspaceId);
    expect(existsSync(project.path)).toBe(true);

    await ctx.api.project.remove({ id: project.id });

    expect(existsSync(project.path)).toBe(false);
    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
  });

  it("recolhe também o diretório do projeto, quando não sobrou nada dentro", async () => {
    const { ctx, workspaceId } = await setup();
    const project = await cloned(ctx, workspaceId);
    const home = join(await realpath(ctx.config.workspacesDir), "pessoal", "api");

    await ctx.api.project.remove({ id: project.id });

    expect(existsSync(home)).toBe(false);
  });

  it("não apaga um caminho que aponta para fora da árvore", async () => {
    // A2, e é ela que carrega o peso: a linha do banco não é prova. Uma linha
    // marcada como gerenciada apontando para fora da árvore é o caso contra o
    // qual o `realpath` no momento de apagar existe — e nenhum caminho do
    // produto a produz, que é justamente por que ela precisa ser fabricada.
    const { ctx, workspaceId } = await setup();
    const foraDaArvore = await createRepo();
    await createProjectRepository(ctx.db).create({
      workspaceId,
      name: "mentiroso",
      path: foraDaArvore,
      defaultBranch: "main",
      managed: true,
    });
    const row = (await ctx.api.project.listByWorkspace({ workspaceId })).find(
      (project) => project.name === "mentiroso",
    )!;

    await expect(ctx.api.project.remove({ id: row.id })).rejects.toThrow(/está fora de/);
    expect(existsSync(join(foraDaArvore, "README.md"))).toBe(true);
  });

  it("não segue link simbólico", async () => {
    // A3. Seguir um link é como um delete sai da árvore em que foi provado
    // estar.
    const { ctx, workspaceId } = await setup();
    const project = await cloned(ctx, workspaceId);
    const alvo = await createRepo();
    const home = join(await realpath(ctx.config.workspacesDir), "pessoal", "link");
    mkdirSync(home, { recursive: true });
    symlinkSync(alvo, join(home, "repo"));
    await createProjectRepository(ctx.db).create({
      workspaceId,
      name: "link",
      path: join(home, "repo"),
      defaultBranch: "main",
      managed: true,
    });

    const outro = (await ctx.api.project.listByWorkspace({ workspaceId })).find(
      (row) => row.name === "link",
    )!;
    await expect(ctx.api.project.remove({ id: outro.id })).rejects.toThrow(/link simbólico/);
    expect(existsSync(alvo)).toBe(true);
    expect(project.managed).toBe(true);
  });

  it("continua bloqueado por worktree, antes de qualquer rm", async () => {
    // A4. As duas guardas que já existiam continuam valendo, e vêm antes.
    const { ctx, workspaceId } = await setup();
    const project = await cloned(ctx, workspaceId);
    await ctx.api.worktree.create({ projectId: project.id, name: "teste" });

    await expect(ctx.api.project.remove({ id: project.id })).rejects.toThrow(/ainda tem worktrees registradas \(1\)/);
    expect(existsSync(project.path)).toBe(true);
  });

  it("é idempotente quando o diretório já sumiu", async () => {
    const { ctx, workspaceId } = await setup();
    const project = await cloned(ctx, workspaceId);
    const { rmSync } = await import("node:fs");
    rmSync(project.path, { recursive: true, force: true });

    await expect(ctx.api.project.remove({ id: project.id })).resolves.toMatchObject({ ok: true });
  });
});

describe("project.remove, projeto registrado por caminho", () => {
  it("tira do registro e não toca no repositório do usuário", async () => {
    // O F2.5 continua inteiro para ele. É a metade da regra que não mudou, e é
    // por isso que existe um teste explícito para ela.
    const { ctx, workspaceId } = await setup();
    const repo = await createRepo();
    const project = await ctx.api.project.add({ workspaceId, path: repo, name: "lorebase" });

    await ctx.api.project.remove({ id: project.id });

    expect(existsSync(repo)).toBe(true);
    expect(existsSync(join(repo, "README.md"))).toBe(true);
    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
  });

  it("recolhe o andaime vazio que o daemon criou para ele", async () => {
    // A2.1: o `worktrees/` que a criação de worktree deixou. Isso não é o F2.5
    // sendo afrouxado — o repositório do usuário nunca esteve aqui dentro.
    const { ctx, workspaceId } = await setup();
    const repo = await createRepo();
    const project = await ctx.api.project.add({ workspaceId, path: repo, name: "lorebase" });
    const worktree = await ctx.api.worktree.create({ projectId: project.id, name: "teste" });
    await ctx.api.worktree.remove({ id: worktree.id });

    await ctx.api.project.remove({ id: project.id });

    expect(existsSync(join(ctx.config.workspacesDir, "pessoal", "lorebase"))).toBe(false);
    expect(existsSync(repo)).toBe(true);
  });

  it("deixa em paz um diretório do projeto que ainda tem coisa dentro", async () => {
    // Bytes que ninguém contabilizou são motivo para parar, não para recursar.
    const { ctx, workspaceId } = await setup();
    const repo = await createRepo();
    const project = await ctx.api.project.add({ workspaceId, path: repo, name: "lorebase" });
    mkdirSync(join(ctx.config.workspacesDir, "pessoal", "lorebase"), { recursive: true });
    const home = join(await realpath(ctx.config.workspacesDir), "pessoal", "lorebase");
    writeFileSync(join(home, "anotacao.txt"), "algo que ninguém esperava\n");

    await ctx.api.project.remove({ id: project.id });

    expect(await readdir(home)).toEqual(["anotacao.txt"]);
  });
});
