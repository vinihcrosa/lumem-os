import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER, CODEX_ADAPTER } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import type { AcpProcess, AcpSpawnRequest } from "../acp/process.js";
import { agentAccount, agentConfig, session } from "../db/schema.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { configForAdapter, createAgentConfigRepository } from "../repositories/agentConfig.js";
import { startAgentSession } from "../sessions/start-agent-session.js";
import {
  FAKE_CONFIG_OPTIONS,
  fakeAgentProcess,
  type FakeAgentScript,
} from "../testing/acp-fake-agent.js";
import {
  createTestCaller,
  type TestCaller,
  type TestCallerOverrides,
} from "../testing/caller.js";
import { appRouter } from "../routers/index.js";
import { createCallerFactory } from "../trpc.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

/** A cópia gerenciada do adaptador, que desde 2026-09-08 é a única que o daemon lança. */
function stageManagedAdapter(state: string): string {
  const bin = join(state, ADAPTERS_DIR_NAME, CLAUDE_ADAPTER.id, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  const managed = join(bin, CLAUDE_ADAPTER.command);
  writeFileSync(managed, "#!/bin/sh\ncat\n");
  chmodSync(managed, 0o755);
  return managed;
}

/** A directory holding one executable, to stand in for an installed agent CLI. */
function fakeAgentBin(name = "fake-agent"): { dir: string; command: string } {
  const dir = tempDir("lumem-bin-");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, "#!/bin/sh\ncat\n");
  chmodSync(file, 0o755);
  return { dir, command: file };
}

/**
 * Um `AcpManager` cujo adaptador é falso, e o spawner que diz o que ele recebeu.
 *
 * Todo agente é ACP desde o ADR de 2026-09-24, então todo teste que cria um
 * precisa de um adaptador que responda o handshake — o `cat` do `fakeAgentBin`
 * só servia enquanto o agente podia ser um PTY. Um processo falso **por spawn**:
 * um só tem o stdout travado no segundo `launch`.
 */
function fakeAcp(script: FakeAgentScript = {}): {
  acpManager: AcpManager;
  spawner: ReturnType<typeof vi.fn<(request: AcpSpawnRequest) => AcpProcess>>;
  spawned: ReturnType<typeof fakeAgentProcess>[];
} {
  const spawned: ReturnType<typeof fakeAgentProcess>[] = [];
  const spawner = vi.fn((_request: AcpSpawnRequest): AcpProcess => {
    const fake = fakeAgentProcess(script);
    spawned.push(fake);
    return fake.process;
  });
  return { acpManager: new AcpManager({ spawner, isAvailable: () => true }), spawner, spawned };
}

async function setup(overrides: TestCallerOverrides = {}): Promise<{
  ctx: TestCaller;
  projectId: string;
  worktreeId: string;
  worktreePath: string;
  repo: string;
}> {
  context = createTestCaller(
    { LUMEM_STATE_DIR: tempDir("lumem-state-"), SHELL: "/bin/sh" },
    overrides,
  );
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

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("session.createShell", () => {
  it("runs in the worktree's directory", async () => {
    // F5.1.
    const { ctx, worktreeId, worktreePath } = await setup();

    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(created).toMatchObject({
      kind: "shell",
      scopeType: "worktree",
      scopeId: worktreeId,
      cwd: worktreePath,
      state: "running",
      agentConfigId: null,
    });
  });

  it("runs in the project's directory when that is the scope", async () => {
    const { ctx, projectId, repo } = await setup();

    const created = await ctx.api.session.createShell({
      scopeType: "project",
      scopeId: projectId,
    });

    expect(created.cwd).toBe(repo);
  });

  it("launches the user's login shell", async () => {
    // F5.5. Without their profile the session has none of their aliases.
    const { ctx, projectId } = await setup();

    const created = await ctx.api.session.createShell({
      scopeType: "project",
      scopeId: projectId,
    });

    expect(created.command).toBe("/bin/sh");
  });

  it("supports several sessions in the same scope at once", async () => {
    // F5.4.
    const { ctx, worktreeId } = await setup();

    const first = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    const second = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(first.id).not.toBe(second.id);
    expect(ctx.ptyManager.get(first.id)?.state).toBe("running");
    expect(ctx.ptyManager.get(second.id)?.state).toBe("running");
  });

  it("reports a scope that does not exist", async () => {
    const { ctx } = await setup();

    await expect(
      ctx.api.session.createShell({ scopeType: "worktree", scopeId: "ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ctx.api.session.createShell({ scopeType: "project", scopeId: "ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a worktree that is no longer on disk", async () => {
    // node-pty would answer a missing cwd with a terminal that exits 1 in
    // silence, which reads as a crash rather than as a missing directory.
    const { ctx, worktreeId, worktreePath } = await setup();
    rmSync(worktreePath, { recursive: true, force: true });
    // What a daemon restart would do: the registration becomes `missing`.
    const { reconcileWorktrees } = await import("../boot/reconcile.js");
    await reconcileWorktrees({ db: ctx.db });

    await expect(
      ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId }),
    ).rejects.toThrow(/não está no disco/);
  });
});

describe("session.createAgent", () => {
  it("launches the configured command in a worktree", async () => {
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId, worktreePath } = await setup({ acpManager });
    const { command } = fakeAgentBin();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "fixture",
      command,
      adapterVersion: "1.0.0",
    });

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    expect(created).toMatchObject({
      kind: "agent",
      agentConfigId: config.id,
      agentName: "fixture",
      command,
      cwd: worktreePath,
      state: "running",
      transport: "acp",
    });
    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ command, cwd: worktreePath }));
  });

  it("accepts a project as the scope", async () => {
    // F5.2 and decision WS-Q15: asking an agent about the repository does not
    // need a branch.
    const { acpManager } = fakeAcp();
    const { ctx, projectId, repo } = await setup({ acpManager });
    const { command } = fakeAgentBin();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "fixture",
      command,
      adapterVersion: "1.0.0",
    });

    const created = await ctx.api.session.createAgent({
      scopeType: "project",
      scopeId: projectId,
      agentConfigId: config.id,
    });

    expect(created.cwd).toBe(repo);
  });

  it("refuses a configuration whose command is not installed", async () => {
    // F6.5, before the spawn. Afterwards is indistinguishable from a crash.
    //
    // Um caminho absoluto, e não mais um nome nu: com todo agente ACP, um nome nu
    // é recusado antes (é o PATH escolhendo), e o que sobra para esta conferência
    // é o arquivo que não está lá.
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "ausente",
      command: "/definitely/not/a/real/binary-xyz",
      adapterVersion: "1.0.0",
    });

    const failure = ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    await expect(failure).rejects.toThrow(/não é executável/);
    expect(spawner).not.toHaveBeenCalled();
    expect(await ctx.api.session.listByScope({ scopeType: "worktree", scopeId: worktreeId })).toEqual(
      [],
    );
  });

  it("passes the configuration's environment to the process", async () => {
    // F5.5: the daemon's environment plus what the configuration declares.
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "echoer",
      command: "/bin/sh",
      args: ["--marcador"],
      env: { LUMEM_AGENT_MARKER: "presente" },
      adapterVersion: "1.0.0",
    });

    await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    expect(spawner).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["--marcador"],
        env: expect.objectContaining({ LUMEM_AGENT_MARKER: "presente" }),
      }),
    );
  });

  it("recusa a configuração aposentada, e não sobe nada", async () => {
    /*
     * `033` Q3: a configuração que era PTY é **legado sem acesso**. Ela continua
     * no banco — a sessão de ontem aponta para ela, e a FK é `restrict` —, só não
     * lança mais nada. Recusar **antes** do spawn é o ponto: depois dele, a linha
     * `claude-code` com `command: "claude"` subiria um PTY com o CLI (ou, agora,
     * um handshake ACP contra um binário que não fala ACP).
     */
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    const { command } = fakeAgentBin();
    await ctx.db
      .insert(agentConfig)
      .values({ id: "ac_old", name: "claude-code", command, retiredAt: new Date() });

    await expect(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId: "ac_old",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "esta configuração rodava o agente num terminal (PTY), e o Lumem não roda mais agente assim",
    });
    expect(spawner).not.toHaveBeenCalled();
    expect(
      await ctx.api.session.listByScope({ scopeType: "worktree", scopeId: worktreeId }),
    ).toEqual([]);
  });

  it("recusa `autonomous` de quem não é o daemon", async () => {
    /*
     * `autonomous: true` abre uma conversa que **nunca pergunta permissão**, e o
     * comentário do campo dizia *"é a esteira, e só ela"* sem nada impor isso: o
     * produto é local e toda procedure é pública, então um `curl` na porta —
     * ou um script na própria página servida pela `014` — abria uma sessão que
     * auto-aprova toda ferramenta, contornando por fora o portão por sessão que
     * a `016` existe para impor.
     */
    const { ctx, worktreeId } = await setup();
    const { command } = fakeAgentBin();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "fixture",
      command,
      adapterVersion: "1.0.0",
    });

    await expect(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId: config.id,
        autonomous: true,
      }),
    ).rejects.toThrow(/só a esteira/);
    expect(
      await ctx.api.session.listByScope({ scopeType: "worktree", scopeId: worktreeId }),
    ).toEqual([]);
  });

  it("o chamador do daemon passa pelo portão", async () => {
    // O mesmo pedido, do chamador que o `bootstrap` monta: ele não pode parar
    // aqui, senão a esteira não abre sessão nenhuma. Ele segue e falha adiante,
    // na configuração — que é a prova de que este portão não foi o que barrou.
    const { ctx, worktreeId } = await setup();
    const daemon = createCallerFactory(appRouter)({ ...ctx.ctx, internal: true });

    await expect(
      daemon.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId: "nao-existe",
        autonomous: true,
      }),
    ).rejects.toThrow(/não existe/);
  });

  it("reports a configuration that does not exist", async () => {
    const { ctx, worktreeId } = await setup();

    await expect(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId: "ghost",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("lança a cópia gerenciada, e não o caminho absoluto gravado na linha", async () => {
    /*
     * O caso desta máquina, em 2026-09-08: a linha de `agent_config` guardava
     * `/…/nvm/…/bin/claude-agent-acp` — o `0.40.0` global, resolvido em 2026-08-30
     * — enquanto o pino dizia `0.75.1`. O router de `agentConfig` não tem `update`,
     * então nenhuma instalação gerenciada correta a desalojaria.
     *
     * A asserção é sobre **o que o spawner recebeu**, e não sobre o arquivo existir:
     * "o binário está no lugar" era exatamente o que ficava verde enquanto o
     * processo que respondia era outro. [ADR de
     * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
     */
    const state = tempDir("lumem-state-");
    const managed = stageManagedAdapter(state);
    const fake = fakeAgentProcess();
    const spawner = vi.fn(() => fake.process);
    const acpManager = new AcpManager({ spawner, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: state, SHELL: "/bin/sh" }, { acpManager });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const repo = await createRepo({ branch: "main" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: repo,
      name: "lorebase",
    });
    const config = await createAgentConfigRepository(context.db).create({
      name: CLAUDE_ADAPTER.id,
      command: "/Users/eu/.nvm/versions/node/v22.17.1/bin/claude-agent-acp",
      adapterVersion: "0.40.0",
    });

    await context.api.session.createAgent({
      scopeType: "project",
      scopeId: project.id,
      agentConfigId: config.id,
    });

    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ command: managed }));
  });
});

describe("session.createAgent com adaptador e config (`033` §3.2)", () => {
  /**
   * Um agente que anota o que lhe pediram, na ordem, e responde como o real.
   *
   * O `set_config_option` do fake devolve o conjunto de sempre por padrão —
   * `opus[1m]` em vigor, peça o que pedir —, o que faria "nasceu no modelo
   * pedido" passar por acaso ou falhar por acaso. Aqui ele devolve o valor
   * trocado, que é o que o adaptador de verdade faz.
   */
  function recordingScript(): { script: FakeAgentScript; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      script: {
        setMode: (modeId) => {
          calls.push(`mode=${modeId}`);
        },
        setConfigOption: (configId, value) => {
          calls.push(`${configId}=${String(value)}`);
          return FAKE_CONFIG_OPTIONS.map((option) =>
            option.id === configId ? { ...option, currentValue: value } : option,
          ) as typeof FAKE_CONFIG_OPTIONS;
        },
      },
    };
  }

  /**
   * O código **e** a frase, conferidos separadamente.
   *
   * `rejects.toMatchObject({ message })` não confere a mensagem de um `Error`
   * nesta versão do vitest — `message: /zzz/` contra `"abc"` passa —, então a
   * frase só é asserção de verdade pelo `toThrow`.
   */
  async function expectRefusal(
    call: Promise<unknown>,
    code: string,
    message: string | RegExp,
  ): Promise<void> {
    await expect(call).rejects.toMatchObject({ code });
    await expect(call).rejects.toThrow(message);
  }

  async function fixtureConfig(ctx: TestCaller): Promise<string> {
    const { command } = fakeAgentBin();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "fixture",
      command,
      adapterVersion: "1.0.0",
    });
    return config.id;
  }

  /** Toda sessão do escopo morta, na linha e no manager: nada ficou vivo. */
  async function expectNothingAlive(ctx: TestCaller, worktreeId: string): Promise<void> {
    await vi.waitFor(async () => {
      const rows = await ctx.api.session.listByScope({ scopeType: "worktree", scopeId: worktreeId });
      expect(rows.map((row) => row.state)).not.toContain("running");
      expect(ctx.acpManager.list().map((info) => info.state)).not.toContain("running");
    });
  }

  it("nasce no modelo pedido, com o modo aplicado primeiro", async () => {
    const { script, calls } = recordingScript();
    const { acpManager } = fakeAcp(script);
    const { ctx, worktreeId } = await setup({ acpManager });
    const agentConfigId = await fixtureConfig(ctx);

    // `model` antes de `mode` no objeto, de propósito: a ordem é do daemon.
    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId,
      config: { model: "sonnet", mode: "plan" },
    });

    expect(calls).toEqual(["mode=plan", "model=sonnet"]);
    expect(created).toMatchObject({ model: "sonnet", mode: "plan", state: "running" });
    // A linha, e não só a resposta: reabrir a aba lê daqui.
    const [row] = await ctx.db.select().from(session).where(eq(session.id, created.id));
    expect(row).toMatchObject({ model: "sonnet", mode: "plan" });
    const live = ctx.acpManager.get(created.id);
    expect(live?.model).toBe("sonnet");
    expect(live?.configOptions.find((option) => option.id === "model")?.currentValue).toBe(
      "sonnet",
    );
  });

  it("não reenvia o valor que já está em vigor", async () => {
    const { script, calls } = recordingScript();
    const { acpManager } = fakeAcp(script);
    const { ctx, worktreeId } = await setup({ acpManager });
    const agentConfigId = await fixtureConfig(ctx);

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId,
      config: { model: "opus[1m]", mode: "plan" },
    });

    // O modo mudou e foi; o modelo já era aquele e não foi.
    expect(calls).toEqual(["mode=plan"]);
    expect(created).toMatchObject({ model: "opus[1m]", mode: "plan" });
  });

  it("modelo que o agente não oferece: recusa com a frase, e nada fica vivo", async () => {
    const { script, calls } = recordingScript();
    const { acpManager, spawner } = fakeAcp(script);
    const { ctx, worktreeId } = await setup({ acpManager });
    const agentConfigId = await fixtureConfig(ctx);

    await expectRefusal(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId,
        config: { mode: "plan", model: "gpt-9" },
      }),
      "BAD_REQUEST",
      'o fixture não oferece mais "gpt-9" em Model — escolha de novo',
    );

    // Subiu, recebeu o modo, e morreu: a falha é no meio da configuração.
    expect(spawner).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["mode=plan"]);
    await expectNothingAlive(ctx, worktreeId);
  });

  it("opção que o agente não tem: recusa com a frase, e nada fica vivo", async () => {
    const { acpManager } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    const agentConfigId = await fixtureConfig(ctx);

    await expectRefusal(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId,
        config: { effort: "high" },
      }),
      "BAD_REQUEST",
      'o fixture não oferece mais a opção "effort" — escolha de novo',
    );
    await expectNothingAlive(ctx, worktreeId);
  });

  it("recusa `agentConfigId` e `adapterId` juntos, antes de subir qualquer coisa", async () => {
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    const agentConfigId = await fixtureConfig(ctx);

    await expectRefusal(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId,
        adapterId: CLAUDE_ADAPTER.id,
      }),
      "BAD_REQUEST",
      /exatamente um/,
    );
    expect(spawner).not.toHaveBeenCalled();
  });

  it("recusa quando não vem nem `agentConfigId` nem `adapterId`", async () => {
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });

    await expectRefusal(
      ctx.api.session.createAgent({ scopeType: "worktree", scopeId: worktreeId }),
      "BAD_REQUEST",
      /exatamente um/,
    );
    expect(spawner).not.toHaveBeenCalled();
  });

  it("pelo adaptador: lança a cópia gerenciada, com a configuração dele", async () => {
    const { script } = recordingScript();
    const { acpManager, spawner } = fakeAcp(script);
    const { ctx, worktreeId } = await setup({ acpManager });
    const managed = stageManagedAdapter(ctx.config.stateDir);

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
      config: { model: "sonnet" },
    });

    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ command: managed }));
    expect(created).toMatchObject({ agentName: CLAUDE_ADAPTER.id, model: "sonnet" });
    // A mesma configuração na segunda vez: uma por adaptador, e não uma por sessão.
    const again = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
    });
    expect(again.agentConfigId).toBe(created.agentConfigId);
  });

  it("a conta padrão chega ao spawner: a primeira sobe **sem** a variável", async () => {
    // `034` T5. A conta de antes da feature é a variável ausente — escrever o
    // caminho padrão faria o Claude procurar outra entrada do Keychain.
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    stageManagedAdapter(ctx.config.stateDir);

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
    });

    const request = spawner.mock.calls[0]![0];
    expect(request.env?.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(request.unsetEnv).toEqual(["CLAUDE_CONFIG_DIR"]);
    const account = await createAgentAccountRepository(ctx.db).defaultFor(created.agentConfigId!);
    const [row] = await ctx.db.select().from(session).where(eq(session.id, created.id));
    expect(row?.agentAccountId).toBe(account!.id);
  });

  it("a conta pedida chega ao spawner com o diretório dela, e a linha nasce nela", async () => {
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    stageManagedAdapter(ctx.config.stateDir);
    const configId = (
      await ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        adapterId: CLAUDE_ADAPTER.id,
      })
    ).agentConfigId!;
    const second = await createAgentAccountRepository(ctx.db).create({
      agentConfigId: configId,
      label: "trabalho",
      configDir: "/contas/trabalho",
    });

    const row = await startAgentSession(ctx.ctx, {
      scopeType: "worktree",
      scopeId: worktreeId,
      agent: { agentConfigId: configId },
      agentAccountId: second.id,
    });

    expect(spawner.mock.calls.at(-1)![0].env?.CLAUDE_CONFIG_DIR).toBe("/contas/trabalho");
    expect(row.agentAccountId).toBe(second.id);
  });

  it("pelo adaptador: o desconhecido é recusado como argumento", async () => {
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });

    await expectRefusal(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        adapterId: "nao-existe",
      }),
      "BAD_REQUEST",
      "adaptador desconhecido: nao-existe",
    );
    expect(spawner).not.toHaveBeenCalled();
  });

  it("pelo adaptador: o não instalado diz o pino, e não cria configuração", async () => {
    const { acpManager, spawner } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });

    await expectRefusal(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        adapterId: CLAUDE_ADAPTER.id,
      }),
      "NOT_FOUND",
      new RegExp(CLAUDE_ADAPTER.pinnedVersion.replaceAll(".", "\\.")),
    );
    expect(spawner).not.toHaveBeenCalled();
    expect(await createAgentConfigRepository(ctx.db).findByName(CLAUDE_ADAPTER.id)).toBeUndefined();
  });
});

describe("session.listByScope and getDetail", () => {
  it("lists only that scope's sessions", async () => {
    const { ctx, projectId, worktreeId } = await setup();
    const inWorktree = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    await ctx.api.session.createShell({ scopeType: "project", scopeId: projectId });

    const listed = await ctx.api.session.listByScope({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(listed.map((row) => row.id)).toEqual([inWorktree.id]);
  });

  it("reports kind, scope, command and state", async () => {
    // F5.10.
    const { ctx, worktreeId } = await setup();
    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(await ctx.api.session.getDetail({ id: created.id })).toMatchObject({
      kind: "shell",
      scopeType: "worktree",
      scopeId: worktreeId,
      command: "/bin/sh",
      state: "running",
    });
  });

  it("reports a session that does not exist", async () => {
    const { ctx } = await setup();

    await expect(ctx.api.session.getDetail({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("session.resume", () => {
  /**
   * The happy path needs an adapter, so it lives in the e2e (`acp-resume.spec.ts`).
   * What belongs here is the endpoint existing, the two refusals that never reach a
   * process, and — since 2026-09-08 — **which** adapter a resume launches.
   *
   * The sentence that used to be here said *"this caller has no `AcpManager` at
   * all"*. It was true and it was the reason no test could reach the ACP branch of
   * `createAgent` or `resume`; the harness now wires one, the same way `bootstrap`
   * does.
   */

  it("relança o adaptador de hoje, não o caminho congelado na sessão morta", async () => {
    /*
     * O comentário do próprio `resume` já dizia que *"como o adaptador é invocado
     * hoje é configuração"* — e ele relançava `row.command`, o caminho absoluto
     * gravado quando a sessão nasceu. Retomar uma conversa de antes de uma subida
     * de pino relançava a versão velha. [ADR de
     * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
     */
    const state = tempDir("lumem-state-");
    const managed = stageManagedAdapter(state);
    // Um processo falso **por spawn**: um só tem o stdout travado no segundo
    // `launch`, e retomar é sempre um segundo launch.
    const spawner = vi.fn(() => fakeAgentProcess().process);
    const acpManager = new AcpManager({ spawner, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: state, SHELL: "/bin/sh" }, { acpManager });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const repo = await createRepo({ branch: "main" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: repo,
      name: "lorebase",
    });
    const config = await createAgentConfigRepository(context.db).create({
      name: CLAUDE_ADAPTER.id,
      command: managed,
      adapterVersion: CLAUDE_ADAPTER.pinnedVersion,
    });
    const created = await context.api.session.createAgent({
      scopeType: "project",
      scopeId: project.id,
      agentConfigId: config.id,
    });
    await context.api.session.close({ id: created.id });
    await vi.waitFor(async () =>
      expect((await context.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );
    // Uma sessão nascida antes desta feature: o caminho de uma cópia global que a
    // instalação gerenciada não desaloja.
    const stale = "/Users/eu/.nvm/versions/node/v22.17.1/bin/claude-agent-acp";
    await context.db
      .update(session)
      .set({ command: stale })
      .where(eq(session.id, created.id));
    spawner.mockClear();

    await context.api.session.resume({ id: created.id });

    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ command: managed }));
    expect(spawner).not.toHaveBeenCalledWith(expect.objectContaining({ command: stale }));
  });

  it("refuses a session that does not exist", async () => {
    const { ctx } = await setup();

    await expect(ctx.api.session.resume({ id: "nao-existe" })).rejects.toMatchObject({
      message: /não existe/,
    });
  });

  it("recusa a sessão de agente que rodou num terminal (PTY), que é histórico", async () => {
    /*
     * A linha legada que a `0033` deixou de pé: `agent` + `pty`, apontando para a
     * configuração aposentada. Ela aparece na lista do checkout (Q3) e **não**
     * reabre — o `session/load` é coisa de adaptador ACP, e o PTY não tem conversa
     * nenhuma para carregar.
     */
    const { ctx, worktreeId, worktreePath } = await setup();
    await ctx.db
      .insert(agentConfig)
      .values({ id: "ac_old", name: "claude-code", command: "claude", retiredAt: new Date() });
    // A conta que a `0035` dá também à configuração aposentada (`034` T4).
    await ctx.db
      .insert(agentAccount)
      .values({ id: "acct_old", agentConfigId: "ac_old", label: "claude-code" });
    await ctx.db.insert(session).values({
      id: "s_old",
      kind: "agent",
      agentConfigId: "ac_old",
      agentAccountId: "acct_old",
      scopeType: "worktree",
      scopeId: worktreeId,
      cwd: worktreePath,
      command: "claude",
      transport: "pty",
      state: "exited",
    });

    await expect(ctx.api.session.resume({ id: "s_old" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: /só conversa ACP/,
    });
  });

  it("refuses a shell, because a shell has no conversation", async () => {
    const { ctx, worktreeId } = await setup();
    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    await ctx.api.session.close({ id: created.id });
    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );

    await expect(ctx.api.session.resume({ id: created.id })).rejects.toMatchObject({
      message: /só conversa ACP/,
    });
  });
});

describe("session.close", () => {
  it("ends the process and the record follows", async () => {
    // F5.8.
    const { ctx, worktreeId } = await setup();
    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    await ctx.api.session.close({ id: created.id });

    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );
  });

  it("keeps a finished session listed, with its conversation still readable", async () => {
    // F5.9: it goes quiet, it does not disappear. O que um agente deixa para ler
    // é a conversa, e não mais o scrollback de um PTY: todo agente é ACP.
    const { acpManager, spawned } = fakeAcp();
    const { ctx, worktreeId } = await setup({ acpManager });
    const { command } = fakeAgentBin();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "curto",
      command,
      adapterVersion: "1.0.0",
    });
    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    spawned[0]!.process.kill();

    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );
    expect(await ctx.api.session.transcript({ id: created.id })).toMatchObject({
      type: "attached",
      sessionId: created.id,
      state: "exited",
    });
    expect(
      await ctx.api.session.listByScope({ scopeType: "worktree", scopeId: worktreeId }),
    ).toHaveLength(1);
  });

  it("reports a session that does not exist", async () => {
    const { ctx } = await setup();

    await expect(ctx.api.session.close({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("agentConfig.list", () => {
  it("reports whether each command can actually be launched", async () => {
    // F6.5: the menu has to show the unavailable one as unavailable rather
    // than letting the user pick it and watch it die.
    const { ctx } = await setup();
    const { command } = fakeAgentBin();
    const configs = createAgentConfigRepository(ctx.db);
    await configs.create({ name: "instalado", command, adapterVersion: "1.0.0" });
    await configs.create({
      name: "ausente",
      command: "definitely-not-a-real-binary-xyz",
      adapterVersion: "1.0.0",
    });

    const listed = await ctx.api.agentConfig.list();

    expect(listed.find((row) => row.name === "instalado")?.available).toBe(true);
    expect(listed.find((row) => row.name === "ausente")?.available).toBe(false);
  });

  it("leaves a retired configuration out", async () => {
    // `033` F1.3: a configuração que era PTY não sobe nada, então oferecê-la no
    // menu é oferecer um beco. Ela continua no banco — a sessão de ontem aponta
    // para ela —, só não aparece.
    const { ctx } = await setup();
    const { command } = fakeAgentBin();
    await ctx.db
      .insert(agentConfig)
      .values({ id: "ac_old", name: "claude-code", command, retiredAt: new Date() });
    await createAgentConfigRepository(ctx.db).create({
      name: "claude",
      command,
      adapterVersion: "0.75.1",
    });

    const listed = await ctx.api.agentConfig.list();

    expect(listed.map((row) => row.name)).toEqual(["claude"]);
  });
});

describe("removal blocked by live sessions", () => {
  it("blocks removing a worktree that still has a session, with the count", async () => {
    // F4.9. There is no force past this: a live process has to be closed, not
    // overridden, or §6's "no session orphaned from its scope" breaks.
    const { ctx, worktreeId } = await setup();
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    const failure = ctx.api.worktree.remove({ id: worktreeId });

    await expect(failure).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(failure).rejects.toThrow(/2 sessão\(ões\) rodando/);
  });

  it("blocks it even with force", async () => {
    const { ctx, worktreeId } = await setup();
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    await expect(
      ctx.api.worktree.remove({ id: worktreeId, force: true }),
    ).rejects.toThrow(/sessão\(ões\) rodando/);
  });

  it("names the live session rather than the dirt when both are true", async () => {
    // PRD §5: the refusal says which of the two it is. Sessions first, because
    // that is the one the user has to act on before anything else can happen.
    const { ctx, worktreeId, worktreePath } = await setup();
    writeFileSync(join(worktreePath, "sujo.txt"), "x");
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    await expect(ctx.api.worktree.remove({ id: worktreeId })).rejects.toThrow(
      /sessão\(ões\) rodando/,
    );
  });

  it("lets the removal through once the sessions are closed", async () => {
    const { ctx, worktreeId } = await setup();
    const session = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    await ctx.api.session.close({ id: session.id });
    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: session.id })).state).toBe("exited"),
    );

    // An exited session must not block: it would block forever, since there is
    // nothing left to close.
    await expect(ctx.api.worktree.remove({ id: worktreeId })).resolves.toEqual({ ok: true });
  });

  it("blocks removing a project that still has a session", async () => {
    const { ctx, projectId, worktreeId } = await setup();
    await ctx.api.worktree.remove({ id: worktreeId });
    await ctx.api.session.createShell({ scopeType: "project", scopeId: projectId });

    await expect(ctx.api.project.remove({ id: projectId })).rejects.toThrow(
      /1 sessão\(ões\) rodando/,
    );
  });

  it("blocks removing a project when one of its worktrees has a running session", async () => {
    // §6 extended to the cascade (F2.5, WS-Q22): removing a project takes its
    // worktrees with it, so a live session in any of them is a scope about to
    // vanish, and blocks the removal exactly as the project's own would.
    const { ctx, projectId, worktreeId } = await setup();
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    await expect(ctx.api.project.remove({ id: projectId })).rejects.toThrow(
      /1 sessão\(ões\) rodando/,
    );
  });
});

/*
 * O trio padrão da conta (`034` T9, emenda da Q1): a conversa nova nasce no
 * modelo e no effort que a conta guardou, quando quem abriu não escolheu outro.
 */
describe("session.createAgent — o trio padrão da conta (034 T9)", () => {
  const MODEL = FAKE_CONFIG_OPTIONS[0]!;
  const EFFORT = {
    id: "effort",
    name: "Effort",
    category: "thought_level",
    type: "select" as const,
    currentValue: "high",
    options: [
      { value: "low", name: "Low" },
      { value: "high", name: "High" },
    ],
  };

  /** `sonnet` oferece effort; `opus[1m]` não — como no adaptador de verdade com `haiku`. */
  function trioScript(): { script: FakeAgentScript; calls: string[] } {
    const calls: string[] = [];
    let model = "opus[1m]";
    let effort = "high";
    const options = () =>
      [
        { ...MODEL, currentValue: model },
        ...(model === "sonnet" ? [{ ...EFFORT, currentValue: effort }] : []),
      ] as unknown as typeof FAKE_CONFIG_OPTIONS;
    return {
      calls,
      script: {
        setConfigOption: (configId, value) => {
          calls.push(`${configId}=${String(value)}`);
          if (configId === "model") model = String(value);
          if (configId === "effort") effort = String(value);
          return options();
        },
      },
    };
  }

  async function withDefaults(model: string | null, effort: string | null, script: FakeAgentScript) {
    const { acpManager, spawner } = fakeAcp(script);
    const { ctx, worktreeId } = await setup({ acpManager });
    stageManagedAdapter(ctx.config.stateDir);
    const configId = await configForAdapter(ctx.db, CLAUDE_ADAPTER.id);
    const account = (await createAgentAccountRepository(ctx.db).defaultFor(configId))!;
    await createAgentAccountRepository(ctx.db).setDefaults(account.id, { model, effort });
    return { ctx, worktreeId, account, spawner };
  }

  it("nasce no modelo e no effort padrão da conta", async () => {
    const { script, calls } = trioScript();
    const { ctx, worktreeId } = await withDefaults("sonnet", "low", script);

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
    });

    // O modelo primeiro: o effort só existe depois de escolher um modelo que o tenha.
    expect(calls).toEqual(["model=sonnet", "effort=low"]);
    expect(created.model).toBe("sonnet");
  });

  it("o effort não é aplicado num modelo que não o oferece", async () => {
    const { script, calls } = trioScript();
    const { ctx, worktreeId } = await withDefaults("opus[1m]", "low", script);

    await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
    });

    expect(calls).toEqual([]);
  });

  it("o que quem abriu escolheu ganha do padrão da conta", async () => {
    const { script, calls } = trioScript();
    const { ctx, worktreeId } = await withDefaults("sonnet", null, script);

    await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
      config: { model: "opus[1m]" },
    });

    expect(calls).not.toContain("model=sonnet");
  });

  it("o modelo padrão sumiu: a conversa abre no do adaptador, diz na conversa, e a conta fica indisponível", async () => {
    const { script, calls } = trioScript();
    const { ctx, worktreeId, account } = await withDefaults("fable-9", "low", script);

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
    });

    expect(created.state).toBe("running");
    expect(created.model).toBe("opus[1m]");
    expect(calls).toEqual([]);
    expect(ctx.acpManager.transcript(created.id).map((entry) => entry.event)).toContainEqual({
      type: "account_default_unavailable",
      requested: "fable-9",
      got: "opus[1m]",
    });
    const listed = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find(
      (row) => row.id === account.id,
    );
    expect(listed?.defaultsUnavailable).toBe(true);
  });

  it("a conta cujo modelo padrão está na lista não fica indisponível", async () => {
    const { script } = trioScript();
    const { ctx, worktreeId, account } = await withDefaults("sonnet", null, script);

    await ctx.api.session.createAgent({ scopeType: "worktree", scopeId: worktreeId, adapterId: "claude" });

    const listed = (await ctx.api.agentAccount.list({ adapterId: "claude" })).find(
      (row) => row.id === account.id,
    );
    expect(listed?.defaultsUnavailable).toBe(false);
  });
});

/*
 * Continuar em outra conta (`034` T11, Q3/Q3a/Q3b): uma sessão nova, na conta
 * escolhida — que pode ser de outro agente —, com o corte da origem como
 * primeiro turno. A origem não é tocada além da linha de vínculo.
 */
describe("session.continueIn (034 T11)", () => {
  function stageAdapter(state: string, spec: typeof CLAUDE_ADAPTER): void {
    const bin = join(state, ADAPTERS_DIR_NAME, spec.id, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, spec.command), "#!/bin/sh\ncat\n");
    chmodSync(join(bin, spec.command), 0o755);
  }

  const LONG_OUTPUT = Array.from({ length: 90 }, (_, index) => `linha ${String(index)} ${"y".repeat(40)}`).join("\n");

  const script: FakeAgentScript = {
    async prompt(text, turn) {
      if (!text.includes("conserta o /orders")) return "end_turn";
      await turn.update({
        sessionUpdate: "agent_message_chunk",
        messageId: "a-1",
        content: { type: "text", text: "Li o handler e achei o bug." },
      } as never);
      await turn.update({
        sessionUpdate: "tool_call",
        toolCallId: "toolu_1",
        title: "Read src/orders.ts",
        kind: "read",
        status: "in_progress",
      } as never);
      // A saída vem na atualização: o `tool_call` do Lumem não tem conteúdo.
      await turn.update({
        sessionUpdate: "tool_call_update",
        toolCallId: "toolu_1",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: LONG_OUTPUT } }],
      } as never);
      return "end_turn";
    },
  };

  async function scene() {
    const fake = fakeAcp(script);
    const { ctx, worktreeId } = await setup({ acpManager: fake.acpManager });
    stageAdapter(ctx.config.stateDir, CLAUDE_ADAPTER);
    stageAdapter(ctx.config.stateDir, CODEX_ADAPTER);

    const source = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
    });
    await ctx.acpManager.prompt(source.id, "conserta o /orders");

    const codexConfig = await configForAdapter(ctx.db, CODEX_ADAPTER.id);
    const codexAccount = await createAgentAccountRepository(ctx.db).create({
      agentConfigId: codexConfig,
      label: "trabalho",
      configDir: "/contas/codex-trabalho",
    });
    return { ...fake, ctx, worktreeId, source, codexAccount };
  }

  it("abre a sessão nova na conta pedida, de outro agente, no mesmo escopo, e grava de onde veio", async () => {
    const { ctx, worktreeId, source, codexAccount, spawner } = await scene();

    const continued = await ctx.api.session.continueIn({
      sessionId: source.id,
      agentAccountId: codexAccount.id,
    });

    expect(continued.id).not.toBe(source.id);
    expect(continued.agentAccountId).toBe(codexAccount.id);
    expect(continued.agentConfigId).toBe(codexAccount.agentConfigId);
    expect(continued.continuedFromId).toBe(source.id);
    expect(continued).toMatchObject({ scopeType: "worktree", scopeId: worktreeId, cwd: source.cwd });
    // O processo é o do Codex, no diretório da conta — e não o Claude com outro rótulo.
    const request = spawner.mock.calls.at(-1)![0];
    expect(request.command).toContain(CODEX_ADAPTER.command);
    expect(request.env?.["CODEX_HOME"]).toBe("/contas/codex-trabalho");
  });

  it("manda o corte como primeiro turno, com a frase que diz de onde ele veio", async () => {
    const { ctx, source, codexAccount, spawned } = await scene();

    await ctx.api.session.continueIn({ sessionId: source.id, agentAccountId: codexAccount.id });

    const target = spawned.at(-1)!;
    await vi.waitFor(() => expect(target.promptBlocks.length).toBeGreaterThan(0));
    const sent = target.promptBlocks[0]!.join("\n");
    expect(sent).toContain("Continuação de uma conversa em Claude Code · ");
    expect(sent).toContain("O que foi dito até aqui:");
    expect(sent).toContain("conserta o /orders");
    expect(sent).toContain("Li o handler e achei o bug.");
    expect(sent).toContain("[Read src/orders.ts — 90 linhas, omitido]");
    expect(sent).not.toContain("linha 42 yyyy");
  });

  it("as duas conversas ganham a linha de vínculo, com agente · conta e o tamanho do que foi levado", async () => {
    const { ctx, source, codexAccount } = await scene();

    const continued = await ctx.api.session.continueIn({
      sessionId: source.id,
      agentAccountId: codexAccount.id,
    });

    const fresh = ctx.acpManager.storedTranscript(continued.id).map((entry) => entry.event);
    const from = fresh.find((event) => event.type === "continued_from");
    expect(from).toMatchObject({ type: "continued_from", sessionId: source.id });
    expect(from).toMatchObject({ label: expect.stringMatching(/^Claude Code · /) as unknown });
    expect(from && "messages" in from ? from.messages : 0).toBe(2);
    expect(from && "approxTokens" in from ? from.approxTokens : 0).toBeGreaterThan(0);
    // A linha vem antes do turno que leva o corte.
    const firstUser = fresh.findIndex((event) => event.type === "message" && event.role === "user");
    expect(fresh.findIndex((event) => event.type === "continued_from")).toBeLessThan(
      firstUser === -1 ? Number.POSITIVE_INFINITY : firstUser,
    );

    const origin = ctx.acpManager.storedTranscript(source.id).map((entry) => entry.event);
    expect(origin.at(-1)).toEqual({ type: "continued_in", sessionId: continued.id, label: "Codex · trabalho" });
  });

  it("a origem continua viva e aceitando prompt", async () => {
    const { ctx, source, codexAccount } = await scene();

    await ctx.api.session.continueIn({ sessionId: source.id, agentAccountId: codexAccount.id });

    const origin = await ctx.api.session.getDetail({ id: source.id });
    expect(origin.state).toBe("running");
    expect(origin.continuedFromId).toBeNull();
    await expect(ctx.acpManager.prompt(source.id, "e agora?")).resolves.toBe("end_turn");
  });

  it("uma origem já encerrada também continua, e a linha dela vai para o disco", async () => {
    const { ctx, source, codexAccount } = await scene();
    ctx.acpManager.kill(source.id);
    await vi.waitFor(() => expect(ctx.acpManager.get(source.id)?.state).toBe("exited"));

    const continued = await ctx.api.session.continueIn({
      sessionId: source.id,
      agentAccountId: codexAccount.id,
    });

    expect(continued.continuedFromId).toBe(source.id);
    const origin = ctx.acpManager.storedTranscript(source.id).map((entry) => entry.event);
    expect(origin.at(-1)).toMatchObject({ type: "continued_in", sessionId: continued.id });
  });

  it("recusa uma conta desconectada sem subir processo nem gravar nada", async () => {
    const { ctx, source, codexAccount, spawner } = await scene();
    await createAgentAccountRepository(ctx.db).disconnect(codexAccount.id);
    const spawnsBefore = spawner.mock.calls.length;
    const sessionsBefore = (await ctx.db.select().from(session)).length;

    await expect(
      ctx.api.session.continueIn({ sessionId: source.id, agentAccountId: codexAccount.id }),
    ).rejects.toThrow(/reconecte a conta/);

    expect(spawner.mock.calls.length).toBe(spawnsBefore);
    expect((await ctx.db.select().from(session)).length).toBe(sessionsBefore);
    const origin = ctx.acpManager.storedTranscript(source.id).map((entry) => entry.event);
    expect(origin.some((event) => event.type === "continued_in")).toBe(false);
  });

  it("recusa um shell, e uma conversa em que nada foi dito", async () => {
    const { ctx, worktreeId, codexAccount } = await scene();
    const shell = await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });
    const silent = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      adapterId: CLAUDE_ADAPTER.id,
    });

    await expect(
      ctx.api.session.continueIn({ sessionId: shell.id, agentAccountId: codexAccount.id }),
    ).rejects.toThrow(/conversa de agente/);
    await expect(
      ctx.api.session.continueIn({ sessionId: silent.id, agentAccountId: codexAccount.id }),
    ).rejects.toThrow(/nada foi dito/);
  });

  it("a vista diz a conta, e só pede o nome dela quando o agente tem mais de uma", async () => {
    const { ctx, source, codexAccount } = await scene();

    const claude = await ctx.api.session.getDetail({ id: source.id });
    expect(claude.agentAccountLabel).not.toBeNull();
    expect(claude.multiAccount).toBe(false);

    const continued = await ctx.api.session.continueIn({
      sessionId: source.id,
      agentAccountId: codexAccount.id,
    });
    // O Codex tem a padrão (criada ao resolver a configuração) e a `trabalho`.
    const codexAccounts = await createAgentAccountRepository(ctx.db).listByConfig(codexAccount.agentConfigId);
    expect(continued.agentAccountLabel).toBe("trabalho");
    expect(continued.multiAccount).toBe(codexAccounts.length > 1);

    await createAgentAccountRepository(ctx.db).create({
      agentConfigId: source.agentConfigId!,
      label: "segunda",
      configDir: "/contas/claude-2",
    });
    expect((await ctx.api.session.getDetail({ id: source.id })).multiAccount).toBe(true);
  });
});
