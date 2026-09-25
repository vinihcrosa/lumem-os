import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import { PROJECT_FILE } from "../memory/project-identity.js";
import type { ScriptRunner } from "../scripts/ScriptRunner.js";
import { SETUP_TIMEOUT_MS } from "../tasks/conveyor-ports.js";
import {
  FAKE_CONFIG_OPTIONS,
  fakeAgentProcess,
  type FakeAgentScript,
} from "../testing/acp-fake-agent.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, runGit, tempDir } from "../testing/git-fixtures.js";

/**
 * `worktree.start` — criar worktree **é** abrir agente com prompt (`033` §3.3).
 *
 * O `ScriptRunner` é falso, e é a única coisa falsa além do adaptador: git e
 * banco são de verdade. A pergunta destes testes é **a ordem** — o prompt só
 * sai depois do exit do `setup`, e o `setup` roda uma vez —, e ordem se prova
 * com um exit que o teste solta na hora que quer, não com tempo de máquina.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

const PROMPT = "Corrigir o bug do login no Safari!";
const DERIVED = "corrigir-o-bug-do-login-no";

/** A cópia gerenciada do adaptador, que é a única que o daemon lança. */
function stageManagedAdapter(state: string): string {
  const bin = join(state, ADAPTERS_DIR_NAME, CLAUDE_ADAPTER.id, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  const managed = join(bin, CLAUDE_ADAPTER.command);
  writeFileSync(managed, "#!/bin/sh\ncat\n");
  chmodSync(managed, 0o755);
  return managed;
}

interface FakeScripts {
  runner: ScriptRunner;
  runToCompletion: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  /** Solta o `setup` mais antigo que ainda espera, com o exit escolhido. */
  finish(exitCode: number | null): void;
}

/**
 * Um `ScriptRunner` que só sabe esperar.
 *
 * `start` recusa como o de verdade recusa um projeto sem script: é o que o
 * `worktree.create` chama em segundo plano, e aqui ele não pode rodar nada —
 * um `start` chamado pelo `worktree.start` seria o `setup` rodando duas vezes.
 */
function fakeScripts(): FakeScripts {
  const waiting: ((exitCode: number | null) => void)[] = [];
  const runToCompletion = vi.fn(
    () =>
      new Promise<number | null>((resolve) => {
        waiting.push(resolve);
      }),
  );
  const start = vi.fn(() => Promise.reject(new Error("nenhum script roda por aqui")));
  const runner: ScriptRunner = {
    status: () => Promise.reject(new Error("não usado")),
    start,
    stop: () => Promise.resolve(null),
    runToCompletion,
    trust: () => Promise.resolve(),
    stopAll: () => Promise.resolve(),
  };
  return {
    runner,
    runToCompletion,
    start,
    finish(exitCode) {
      const next = waiting.shift();
      if (next === undefined) throw new Error("nenhum setup esperando");
      next(exitCode);
    },
  };
}

/** Um `set_config_option` que devolve o valor pedido, como o adaptador de verdade. */
const switching: FakeAgentScript = {
  setConfigOption: (configId, value) =>
    FAKE_CONFIG_OPTIONS.map((option) =>
      option.id === configId ? { ...option, currentValue: value } : option,
    ) as typeof FAKE_CONFIG_OPTIONS,
};

async function setup(
  options: { setup?: string; stage?: boolean; script?: FakeAgentScript } = {},
) {
  const spawned: ReturnType<typeof fakeAgentProcess>[] = [];
  const spawner = vi.fn(() => {
    const fake = fakeAgentProcess({ ...switching, ...options.script });
    spawned.push(fake);
    return fake.process;
  });
  const acpManager = new AcpManager({ spawner, isAvailable: () => true });
  const scripts = fakeScripts();
  context = createTestCaller(
    { LUMEM_STATE_DIR: tempDir("lumem-state-"), SHELL: "/bin/sh" },
    { acpManager, scripts: scripts.runner },
  );
  if (options.stage !== false) stageManagedAdapter(context.config.stateDir);

  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lorebase",
  });

  // Commitado: a worktree nova é um checkout do que está no commit, e o
  // `[scripts]` que vale é o dela.
  if (options.setup !== undefined) {
    const file = join(repo, PROJECT_FILE);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `id = "prj_teste"\n\n[scripts]\nsetup = ${JSON.stringify(options.setup)}\n`,
      "utf8",
    );
    await runGit(repo, "add", "-A");
    await runGit(repo, "commit", "-m", "scripts do projeto");
  }

  return { ctx: context, projectId: project.id, repo, scripts, spawned, spawner };
}

/**
 * Deixa a máquina de estados andar até onde ela anda sem E/S.
 *
 * Não é um `sleep`: o banco é síncrono, então o que vem depois de um exit —
 * reler a linha e decidir — é só microtask, e um `setImmediate` roda depois de
 * todas elas. É o que torna uma asserção de *"nada aconteceu"* uma asserção.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Tudo que o adaptador ouviu como prompt, bloco por bloco, em todas as sessões. */
function prompted(spawned: ReturnType<typeof fakeAgentProcess>[]): string[] {
  return spawned.flatMap((fake) => fake.promptBlocks.flat());
}

describe("worktree.start", () => {
  it("sem `setup`: o prompt sai na hora, e a pendência zera", async () => {
    const { ctx, projectId, scripts, spawned } = await setup();

    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });

    await vi.waitFor(() => expect(prompted(spawned)).toContain(PROMPT));
    await vi.waitFor(async () =>
      expect(await ctx.api.session.getDetail({ id: started.sessionId })).toMatchObject({
        pendingPrompt: null,
        pendingReason: null,
      }),
    );
    // Nada a preparar é nada a rodar — nem pelo caminho do `create`.
    expect(scripts.runToCompletion).not.toHaveBeenCalled();
    expect(scripts.start).not.toHaveBeenCalled();
  });

  it("cria a worktree com o nome do prompt, e a sessão do agente dentro dela", async () => {
    const { ctx, projectId } = await setup();

    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });

    const [worktree] = await ctx.api.worktree.listByProject({ projectId });
    expect(worktree).toMatchObject({ id: started.worktreeId, name: DERIVED, branch: DERIVED });
    expect(existsSync(worktree!.path)).toBe(true);
    expect(await ctx.api.session.getDetail({ id: started.sessionId })).toMatchObject({
      kind: "agent",
      transport: "acp",
      scopeType: "worktree",
      scopeId: started.worktreeId,
      cwd: worktree!.path,
      agentName: CLAUDE_ADAPTER.id,
      state: "running",
    });
  });

  it("nasce no modelo pedido, antes de qualquer prompt", async () => {
    const { ctx, projectId } = await setup();

    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
      config: { model: "sonnet" },
    });

    expect((await ctx.api.session.getDetail({ id: started.sessionId })).model).toBe("sonnet");
  });

  it("o nome dado ganha do derivado", async () => {
    const { ctx, projectId } = await setup();

    await ctx.api.worktree.start({
      projectId,
      name: "feat/safari",
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });

    expect((await ctx.api.worktree.listByProject({ projectId })).map((row) => row.name)).toEqual([
      "feat/safari",
    ]);
  });

  it("colisão do nome derivado: `-2`, depois `-3`", async () => {
    const { ctx, projectId } = await setup();
    await ctx.api.worktree.create({ projectId, name: DERIVED });

    await ctx.api.worktree.start({ projectId, prompt: PROMPT, adapterId: CLAUDE_ADAPTER.id });
    await ctx.api.worktree.start({ projectId, prompt: PROMPT, adapterId: CLAUDE_ADAPTER.id });

    const names = (await ctx.api.worktree.listByProject({ projectId })).map((row) => row.name);
    expect(names.sort()).toEqual([DERIVED, `${DERIVED}-2`, `${DERIVED}-3`]);
  });

  it("a branch que sobrou no repositório também é colisão", async () => {
    // O `worktree add -b` recusaria com "já existe"; o sufixo chega antes.
    const { ctx, projectId, repo } = await setup();
    await runGit(repo, "branch", DERIVED);

    await ctx.api.worktree.start({ projectId, prompt: PROMPT, adapterId: CLAUDE_ADAPTER.id });

    expect((await ctx.api.worktree.listByProject({ projectId }))[0]?.name).toBe(`${DERIVED}-2`);
  });

  it("com `setup`: o prompt só sai depois do exit 0, e o `setup` roda uma vez", async () => {
    const { ctx, projectId, scripts, spawned } = await setup({ setup: "pnpm install" });

    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });

    // A mutação devolveu, e o prompt está gravado esperando.
    expect(await ctx.api.session.getDetail({ id: started.sessionId })).toMatchObject({
      pendingPrompt: PROMPT,
      pendingReason: null,
    });
    await vi.waitFor(() => expect(scripts.runToCompletion).toHaveBeenCalledTimes(1));
    expect(scripts.runToCompletion).toHaveBeenCalledWith(
      { scopeType: "worktree", scopeId: started.worktreeId },
      "setup",
      { timeoutMs: SETUP_TIMEOUT_MS },
    );
    // O `setup` está rodando: nada foi para o agente ainda.
    expect(prompted(spawned)).toEqual([]);

    scripts.finish(0);

    await vi.waitFor(() => expect(prompted(spawned)).toContain(PROMPT));
    await vi.waitFor(async () =>
      expect(await ctx.api.session.getDetail({ id: started.sessionId })).toMatchObject({
        pendingPrompt: null,
        pendingReason: null,
      }),
    );
    // Uma vez: nem o `start` do caminho do `create`, nem uma segunda espera.
    expect(scripts.runToCompletion).toHaveBeenCalledTimes(1);
    expect(scripts.start).not.toHaveBeenCalled();
    expect(prompted(spawned).filter((text) => text === PROMPT)).toHaveLength(1);
  });

  it.each([
    ["saiu com 1", 1],
    ["estourou o teto", null],
  ])("`setup` %s: `setup_failed`, e nenhum prompt", async (_label, exitCode) => {
    const { ctx, projectId, scripts, spawned } = await setup({ setup: "pnpm install" });
    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });
    await vi.waitFor(() => expect(scripts.runToCompletion).toHaveBeenCalledTimes(1));

    scripts.finish(exitCode);

    await vi.waitFor(async () =>
      expect(await ctx.api.session.getDetail({ id: started.sessionId })).toMatchObject({
        pendingPrompt: PROMPT,
        pendingReason: "setup_failed",
      }),
    );
    expect(prompted(spawned)).toEqual([]);
  });

  it("falhou abrir a sessão: a worktree criada é removida", async () => {
    // Sem a cópia gerenciada do adaptador, o `startAgentSession` recusa.
    const { ctx, projectId, repo, spawner } = await setup({ stage: false });

    const failure = ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });
    await expect(failure).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A frase do adaptador ausente, e não "procedure não existe": o mesmo código
    // serviria às duas, e só uma delas criou a worktree antes de falhar.
    await expect(failure).rejects.toThrow(
      new RegExp(CLAUDE_ADAPTER.pinnedVersion.replaceAll(".", "\\.")),
    );

    expect(spawner).not.toHaveBeenCalled();
    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
    expect(await runGit(repo, "worktree", "list")).not.toContain(DERIVED);
    expect(
      existsSync(join(ctx.config.workspacesDir, "pessoal", "lorebase", "worktrees", DERIVED)),
    ).toBe(false);
  });

  it("recusa prompt vazio antes de criar qualquer coisa", async () => {
    const { ctx, projectId } = await setup();

    await expect(
      ctx.api.worktree.start({ projectId, prompt: "   ", adapterId: CLAUDE_ADAPTER.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await ctx.api.worktree.listByProject({ projectId })).toEqual([]);
  });
});

describe("session.sendPending e session.discardPending", () => {
  /** A worktree com o `setup` que falhou: o prompt esperando uma decisão. */
  async function failedSetup() {
    const fixture = await setup({ setup: "pnpm install" });
    const started = await fixture.ctx.api.worktree.start({
      projectId: fixture.projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });
    await vi.waitFor(() => expect(fixture.scripts.runToCompletion).toHaveBeenCalledTimes(1));
    fixture.scripts.finish(1);
    await vi.waitFor(async () =>
      expect((await fixture.ctx.api.session.getDetail({ id: started.sessionId })).pendingReason).toBe(
        "setup_failed",
      ),
    );
    return { ...fixture, sessionId: started.sessionId };
  }

  it("`sendPending` manda o prompt, e a pendência zera", async () => {
    const { ctx, spawned, sessionId, scripts } = await failedSetup();

    await ctx.api.session.sendPending({ id: sessionId });

    await vi.waitFor(() => expect(prompted(spawned)).toEqual([PROMPT]));
    await vi.waitFor(async () =>
      expect(await ctx.api.session.getDetail({ id: sessionId })).toMatchObject({
        pendingPrompt: null,
        pendingReason: null,
      }),
    );
    // Mandar assim mesmo é mandar, e não tentar o `setup` de novo.
    expect(scripts.runToCompletion).toHaveBeenCalledTimes(1);
  });

  it("`discardPending` zera sem mandar", async () => {
    const { ctx, spawned, sessionId } = await failedSetup();

    const view = await ctx.api.session.discardPending({ id: sessionId });

    expect(view).toMatchObject({ pendingPrompt: null, pendingReason: null });
    expect(await ctx.api.session.getDetail({ id: sessionId })).toMatchObject({
      pendingPrompt: null,
      pendingReason: null,
    });
    expect(prompted(spawned)).toEqual([]);
  });

  it("os dois recusam quando não há nada pendente", async () => {
    const { ctx, sessionId } = await failedSetup();
    await ctx.api.session.discardPending({ id: sessionId });

    await expect(ctx.api.session.sendPending({ id: sessionId })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(ctx.api.session.sendPending({ id: sessionId })).rejects.toThrow(
      /não há prompt pendente/,
    );
    await expect(ctx.api.session.discardPending({ id: sessionId })).rejects.toThrow(
      /não há prompt pendente/,
    );
  });

  it("descartar durante o `setup`: o exit 0 não manda nada", async () => {
    const { ctx, projectId, scripts, spawned } = await setup({ setup: "pnpm install" });
    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });
    await vi.waitFor(() => expect(scripts.runToCompletion).toHaveBeenCalledTimes(1));

    await ctx.api.session.discardPending({ id: started.sessionId });
    scripts.finish(0);
    await settle();

    expect(await ctx.api.session.getDetail({ id: started.sessionId })).toMatchObject({
      pendingPrompt: null,
      pendingReason: null,
    });
    expect(prompted(spawned)).toEqual([]);
  });
});

describe("retomar a sessão cujo prompt nunca saiu (M2a)", () => {
  /*
   * O daemon caiu durante o `setup`: a linha tem o prompt pendente e **nenhum
   * turno**. A M2 mediu que `session/load` de uma conversa sem turno falha nos
   * dois adaptadores — o fake daqui reproduz isso recusando o load —, então
   * retomar é `session/new`, com o modelo gravado, e a mesma máquina de
   * estados de novo.
   */
  it("abre uma sessão nova no mesmo modelo, e o prompt sai depois do `setup`", async () => {
    const { ctx, projectId, scripts, spawned, spawner } = await setup({
      setup: "pnpm install",
      script: {
        loadSession: () => {
          throw new Error("Resource not found");
        },
      },
    });
    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
      config: { model: "sonnet" },
    });
    await vi.waitFor(() => expect(scripts.runToCompletion).toHaveBeenCalledTimes(1));
    // O daemon "cai": a sessão morre com o `setup` ainda rodando.
    await ctx.api.session.close({ id: started.sessionId });
    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: started.sessionId })).state).toBe("exited"),
    );
    spawner.mockClear();

    const resumed = await ctx.api.session.resume({ id: started.sessionId });

    expect(spawner).toHaveBeenCalledTimes(1);
    expect(resumed).toMatchObject({
      state: "running",
      resumedFromId: started.sessionId,
      model: "sonnet",
      pendingPrompt: PROMPT,
      pendingReason: null,
    });
    // O prompt **mudou de casa**: uma pendência só, na sessão que pode mandá-la.
    expect(await ctx.api.session.getDetail({ id: started.sessionId })).toMatchObject({
      pendingPrompt: null,
      pendingReason: null,
    });

    await vi.waitFor(() => expect(scripts.runToCompletion).toHaveBeenCalledTimes(2));
    expect(prompted(spawned)).toEqual([]);
    // O `setup` da primeira rodada chega ao fim também — no daemon de verdade
    // ele morreu junto, e aqui ele prova que a espera antiga relê a linha: a
    // pendência não mora mais na sessão morta, e nada sai por ela.
    scripts.finish(0);
    await settle();
    expect(prompted(spawned)).toEqual([]);
    scripts.finish(0);

    await vi.waitFor(() => expect(spawned.at(-1)?.promptBlocks.flat()).toContain(PROMPT));
    await vi.waitFor(async () =>
      expect(await ctx.api.session.getDetail({ id: resumed.id })).toMatchObject({
        pendingPrompt: null,
        pendingReason: null,
      }),
    );
  });

  it("o `setup` que já falhou continua esperando a decisão, sem rodar de novo", async () => {
    const { ctx, projectId, scripts, spawned } = await setup({
      setup: "pnpm install",
      script: {
        loadSession: () => {
          throw new Error("Resource not found");
        },
      },
    });
    const started = await ctx.api.worktree.start({
      projectId,
      prompt: PROMPT,
      adapterId: CLAUDE_ADAPTER.id,
    });
    await vi.waitFor(() => expect(scripts.runToCompletion).toHaveBeenCalledTimes(1));
    scripts.finish(1);
    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: started.sessionId })).pendingReason).toBe(
        "setup_failed",
      ),
    );
    await ctx.api.session.close({ id: started.sessionId });
    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: started.sessionId })).state).toBe("exited"),
    );

    const resumed = await ctx.api.session.resume({ id: started.sessionId });

    expect(resumed).toMatchObject({ pendingPrompt: PROMPT, pendingReason: "setup_failed" });
    await settle();
    expect(scripts.runToCompletion).toHaveBeenCalledTimes(1);
    expect(prompted(spawned)).toEqual([]);
  });
});
