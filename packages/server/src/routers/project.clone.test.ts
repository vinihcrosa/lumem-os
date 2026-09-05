import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTestCaller, type TestCaller } from "../testing/caller.js";
import {
  cleanupGitFixtures,
  createHeavyRepo,
  createRepo,
  runGit,
  tempDir,
} from "../testing/git-fixtures.js";
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

/** Waits for the job to reach a terminal state, through its own stream. */
async function untilDone(ctx: TestCaller, jobId: string): Promise<CloneJob> {
  const controller = new AbortController();
  let last: CloneJob | undefined;
  for await (const job of ctx.ctx.clones.subscribe(jobId, controller.signal)) last = job;
  return last!;
}

describe("project.clone", () => {
  it("clona, registra o projeto e o marca como gerenciado", async () => {
    const { ctx, workspaceId } = await setup();
    const origem = await createRepo({ branch: "main" });

    const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}` });
    const fim = await untilDone(ctx, job.id);

    expect(fim.state).toBe("done");
    const projects = await ctx.api.project.listByWorkspace({ workspaceId });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      managed: true,
      remoteUrl: `file://${origem}`,
      defaultBranch: "main",
      available: true,
    });
    // Pelo caminho **real**: a guarda resolve o `realpath` antes de qualquer
    // outra coisa, e é o que ela provou que fica registrado — nunca o que foi
    // pedido. Em macOS `/var` é link para `/private/var`, e é aí que se vê.
    expect(projects[0]!.path).toBe(
      join(await realpath(ctx.config.workspacesDir), "pessoal", projects[0]!.name, "repo"),
    );
  });

  it("deixa o projeto pronto para cortar worktree", async () => {
    // O critério 10 do PRD: um projeto clonado não é de segunda classe.
    const { ctx, workspaceId } = await setup();
    const origem = await createRepo({ branch: "main" });

    const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}` });
    await untilDone(ctx, job.id);
    const [projeto] = await ctx.api.project.listByWorkspace({ workspaceId });
    const worktree = await ctx.api.worktree.create({ projectId: projeto!.id, name: "teste" });

    expect(worktree.path).toBe(
      join(ctx.config.workspacesDir, "pessoal", projeto!.name, "worktrees", "teste"),
    );
    expect(existsSync(worktree.path)).toBe(true);
    expect(existsSync(join(worktree.path, "README.md"))).toBe(true);
  });

  it("recusa antes de qualquer processo nascer, nomeando a regra", async () => {
    const { ctx, workspaceId } = await setup();

    await expect(ctx.api.project.clone({ workspaceId, source: "ext::sh -c id" })).rejects.toThrow(
      /ext/,
    );
    await expect(
      ctx.api.project.clone({ workspaceId, source: "git://host/r.git" }),
    ).rejects.toThrow(/autentica/);
    expect(ctx.ctx.clones.active()).toBeUndefined();
  });

  it("recusa um caminho local dizendo qual é o caminho certo", async () => {
    const { ctx, workspaceId } = await setup();

    await expect(
      ctx.api.project.clone({ workspaceId, source: "/Users/vc/GitHub/lorebase" }),
    ).rejects.toThrow(/adicionar projeto/);
  });

  it("recusa um nome já existente antes de baixar nada", async () => {
    // F6.4, o caso comum: resolvido a custo zero, e o usuário ainda pode
    // escolher outro nome antes de esperar quatro minutos.
    const { ctx, workspaceId } = await setup();
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api" });

    await expect(
      ctx.api.project.clone({
        workspaceId,
        source: `file://${await createRepo()}`,
        name: "api",
      }),
    ).rejects.toThrow(/já existe um projeto chamado "api"/);
  });

  it("recusa um segundo clone nomeando o que está rodando", async () => {
    // A11. Sem fila.
    const { ctx, workspaceId } = await setup();
    const pesado = await createHeavyRepo();
    const job = await ctx.api.project.clone({
      workspaceId,
      source: `file://${pesado}`,
      name: "pesado",
    });

    await expect(
      ctx.api.project.clone({ workspaceId, source: `file://${await createRepo()}`, name: "outro" }),
    ).rejects.toThrow(/já há um clone em andamento: pesado/);

    await ctx.api.project.cloneCancel({ jobId: job.id });
    await untilDone(ctx, job.id);
  });

  it("relata falha com a classe, sem registrar nada", async () => {
    const { ctx, workspaceId } = await setup();

    const job = await ctx.api.project.clone({
      workspaceId,
      source: "ssh://127.0.0.1:1/repo.git",
      name: "recusado",
    });
    const fim = await untilDone(ctx, job.id);

    expect(fim).toMatchObject({ state: "failed", failure: "refused" });
    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
  });

  it("cancela e não deixa nada no disco nem no registro", async () => {
    const { ctx, workspaceId } = await setup();
    const pesado = await createHeavyRepo();

    const job = await ctx.api.project.clone({
      workspaceId,
      source: `file://${pesado}`,
      name: "pesado",
    });
    await ctx.api.project.cloneCancel({ jobId: job.id });
    const fim = await untilDone(ctx, job.id);

    expect(fim.state).toBe("cancelled");
    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toEqual([]);
    const home = join(ctx.config.workspacesDir, "pessoal", "pesado");
    expect(existsSync(home) ? await readdir(home) : []).toEqual([]);
  });

  it("sufixa o nome tomado durante o clone, e diz o que fez", async () => {
    // A corrida que sobra depois da checagem prévia. Falhar aqui significaria
    // apagar o download por causa de uma string.
    const { ctx, workspaceId } = await setup();
    // Pesado de propósito: com um repositório pequeno o clone termina antes de
    // o concorrente registrar, e o teste passaria a exercitar o caminho feliz
    // sem dizer que deixou de exercitar a corrida.
    const origem = await createHeavyRepo();
    const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}`, name: "api" });
    // Enquanto o clone roda, alguém registra o nome.
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api" });

    const fim = await untilDone(ctx, job.id);

    expect(fim).toMatchObject({ state: "done" });
    expect(fim.message).toContain("registrado como api-2");
    const clonado = (await ctx.api.project.listByWorkspace({ workspaceId })).find(
      (project) => project.managed,
    );
    expect(clonado?.name).toBe("api-2");
    expect(clonado?.path).toBe(
      join(await realpath(ctx.config.workspacesDir), "pessoal", "api-2", "repo"),
    );
  });

  it("não deixa temporário para trás em nenhum dos dois desfechos", async () => {
    const { ctx, workspaceId } = await setup();
    const origem = await createRepo();

    const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}`, name: "api" });
    await untilDone(ctx, job.id);

    const home = join(ctx.config.workspacesDir, "pessoal", "api");
    expect(await readdir(home)).toEqual(["repo"]);
  });
});

describe("o que a corrida de nome move, e o que ela deixa para trás", () => {
  it("recolhe a home vazia do nome original quando o clone é relocado", async () => {
    // `prepareCloneTarget` cria `<ws>/<nome>/` antes do download. Se o nome for
    // tomado durante ele, o `rename` leva os bytes para outra home e a primeira
    // fica vazia — andaime que ninguém planejou, e que ninguém coletaria: o
    // `collectEmptyProjectHome` só roda na remoção do projeto.
    const { ctx, workspaceId } = await setup();
    const origem = await createHeavyRepo();
    const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}`, name: "api" });
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api" });

    await untilDone(ctx, job.id);

    expect(existsSync(join(ctx.config.workspacesDir, "pessoal", "api"))).toBe(false);
    expect(existsSync(join(await realpath(ctx.config.workspacesDir), "pessoal", "api-2", "repo"))).toBe(
      true,
    );
  });

  it("apaga o que existe, e não o que estava planejado, quando falha depois de mover", async () => {
    // A invariante do §8 tem um jeito de vazar: `registerCloned` move o
    // diretório ao perder a corrida de nome, e se a tentativa seguinte falhar,
    // o `catch` apagaria o caminho de **antes** do rename. O `rm` viraria no-op
    // e sobraria um checkout populado que o daemon não rastreia mais.
    const { ctx, workspaceId } = await setup();
    const origem = await createHeavyRepo();
    const git = ctx.ctx.git;
    const resolveDefaultBranch = git.resolveDefaultBranch.bind(git);
    // Falha só na segunda tentativa — a que roda já com o nome sufixado, depois
    // de o diretório ter sido movido.
    git.resolveDefaultBranch = async (path: string) =>
      path.includes("api-2")
        ? Promise.reject(new Error("falha depois do rename"))
        : resolveDefaultBranch(path);

    const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}`, name: "api" });
    await ctx.api.project.add({ workspaceId, path: await createRepo(), name: "api" });
    const fim = await untilDone(ctx, job.id);

    expect(fim.state).toBe("failed");
    const pessoal = join(await realpath(ctx.config.workspacesDir), "pessoal");
    expect(existsSync(join(pessoal, "api-2", "repo"))).toBe(false);
    expect(existsSync(join(pessoal, "api"))).toBe(false);
    // E o projeto que ganhou a corrida continua registrado, intocado.
    expect(await ctx.api.project.listByWorkspace({ workspaceId })).toHaveLength(1);
  });
});

describe("repositório vazio", () => {
  it("clona, e o projeto nasce válido", async () => {
    // Q19: dá para começar no Lumem no dia 0.
    const { ctx, workspaceId } = await setup();
    const vazio = await createRepo({ empty: true });

    const job = await ctx.api.project.clone({ workspaceId, source: `file://${vazio}`, name: "dia0" });
    const fim = await untilDone(ctx, job.id);

    expect(fim.state).toBe("done");
    const [projeto] = await ctx.api.project.listByWorkspace({ workspaceId });
    expect(projeto).toMatchObject({ name: "dia0", available: true, hasCommits: false });
  });

  it("explica por que ainda não corta worktree, em vez de repassar o erro do git", async () => {
    // F6.13. "invalid reference" não explica nada a ninguém.
    const { ctx, workspaceId } = await setup();
    const vazio = await createRepo({ empty: true });
    const job = await ctx.api.project.clone({ workspaceId, source: `file://${vazio}`, name: "dia0" });
    await untilDone(ctx, job.id);
    const [projeto] = await ctx.api.project.listByWorkspace({ workspaceId });

    await expect(
      ctx.api.worktree.create({ projectId: projeto!.id, name: "teste" }),
    ).rejects.toThrow(/ainda não tem nenhum commit/);
  });

  it("volta a cortar assim que houver um commit, sem ninguém avisar o daemon", async () => {
    // `hasCommits` é calculado por requisição, como `available`: o primeiro
    // commit pode acontecer no terminal ao lado, e um valor guardado seria uma
    // mentira que sobrevive ao fato.
    const { ctx, workspaceId } = await setup();
    const vazio = await createRepo({ empty: true });
    const job = await ctx.api.project.clone({ workspaceId, source: `file://${vazio}`, name: "dia0" });
    await untilDone(ctx, job.id);
    const [projeto] = await ctx.api.project.listByWorkspace({ workspaceId });

    writeFileSync(join(projeto!.path, "primeiro.md"), "# oi\n");
    await runGit(projeto!.path, "add", "primeiro.md");
    await runGit(projeto!.path, "commit", "-m", "primeiro");

    expect(await ctx.api.project.get({ id: projeto!.id })).toMatchObject({ hasCommits: true });
    await expect(
      ctx.api.worktree.create({ projectId: projeto!.id, name: "teste" }),
    ).resolves.toMatchObject({ name: "teste" });
  });
});

describe("o segredo", () => {
  it("some do job, da mensagem de erro e do que a procedure devolve", async () => {
    // A superfície onde um segredo mais vaza é a **falha**, porque a mensagem
    // é a do git e ninguém a escreveu pensando nisso. Por isso o caso testado
    // é o que falha: `ssh://` com senha, contra uma porta que recusa na hora.
    const { ctx, workspaceId } = await setup();

    const job = await ctx.api.project.clone({
      workspaceId,
      source: "ssh://usuario:ghp_naovazaisso@127.0.0.1:1/org/repo.git",
      name: "recusado",
    });
    const fim = await untilDone(ctx, job.id);

    expect(fim.state).toBe("failed");
    expect(JSON.stringify(job)).not.toContain("ghp_naovazaisso");
    expect(JSON.stringify(fim)).not.toContain("ghp_naovazaisso");
    expect(fim.url).toBe("ssh://127.0.0.1:1/org/repo.git");
  });

  it("guarda em remote_url e no .git/config exatamente a URL sanitizada", async () => {
    // A outra ponta: no caminho feliz, o que sobra gravado é `url`. Que `url`
    // não carrega credencial é o que `git-url.test.ts` prova — `file://` não
    // aceita userinfo, então é o teste acima que fecha essa metade.
    const { ctx, workspaceId } = await setup();
    const origem = await createRepo();

    const job = await ctx.api.project.clone({ workspaceId, source: `file://${origem}`, name: "api" });
    await untilDone(ctx, job.id);

    const [projeto] = await ctx.api.project.listByWorkspace({ workspaceId });
    expect(projeto!.remoteUrl).toBe(`file://${origem}`);
    expect(readFileSync(join(projeto!.path, ".git", "config"), "utf8")).toContain(
      `url = file://${origem}\n`,
    );
  });
});

describe("project.cloneJobs", () => {
  it("devolve o job vivo, que é o que sobrevive a um recarregamento", async () => {
    const { ctx, workspaceId } = await setup();
    const pesado = await createHeavyRepo();
    const job = await ctx.api.project.clone({
      workspaceId,
      source: `file://${pesado}`,
      name: "pesado",
    });

    expect(await ctx.api.project.cloneJobs({ workspaceId })).toMatchObject([{ id: job.id }]);

    await ctx.api.project.cloneCancel({ jobId: job.id });
    await untilDone(ctx, job.id);
  });

  it("não mistura workspaces", async () => {
    const { ctx, workspaceId } = await setup();
    const outro = await ctx.api.workspace.create({ name: "trabalho" });
    const pesado = await createHeavyRepo();
    const job = await ctx.api.project.clone({
      workspaceId,
      source: `file://${pesado}`,
      name: "pesado",
    });

    expect(await ctx.api.project.cloneJobs({ workspaceId: outro.id })).toEqual([]);

    await ctx.api.project.cloneCancel({ jobId: job.id });
    await untilDone(ctx, job.id);
  });
});

describe("project.parseSource", () => {
  it("responde o que o servidor entendeu, com o destino calculado", async () => {
    const { ctx, workspaceId } = await setup();

    const plano = await ctx.api.project.parseSource({
      workspaceId,
      source: "https://github.com/org/api.git",
    });

    expect(plano).toMatchObject({
      kind: "url",
      name: "api",
      targetPath: join(ctx.config.workspacesDir, "pessoal", "api", "repo"),
    });
  });

  it("marca http como sem TLS", async () => {
    const { ctx, workspaceId } = await setup();

    expect(
      await ctx.api.project.parseSource({ workspaceId, source: "http://git.interno/a/b.git" }),
    ).toMatchObject({ insecure: true });
  });

  it("devolve a recusa em vez de estourar", async () => {
    // A linha `↳` precisa dizer o motivo enquanto a pessoa ainda está digitando.
    const { ctx, workspaceId } = await setup();

    expect(await ctx.api.project.parseSource({ workspaceId, source: "ftp://x/y" })).toMatchObject({
      kind: "refused",
      rule: "scheme",
    });
  });
});
