import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER, LUMEM_VERSION, PACKAGE_NAME, type InstallCommand } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";

import { daemonSettings } from "../db/schema.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import {
  createTestCaller,
  type TestCaller,
  type TestCallerOverrides,
  type TestUpdateOverrides,
} from "../testing/caller.js";

/**
 * O `system` (`038`, Parte 2): o que a topbar e a tela de configurações perguntam ao
 * daemon sobre a versão dele.
 *
 * O registry é um `fetch` de mentira, o gerenciador de pacote é uma função que só
 * guarda o que recebeu, e o daemon **não sai**: o desligamento injetado é uma
 * promessa que ninguém resolve. Tudo o mais é o router de verdade, sobre um banco
 * de arquivo próprio — o `daemon_settings` é a linha que a migração criou.
 */

const callers: TestCaller[] = [];

afterEach(async () => {
  for (const caller of callers.splice(0)) await caller.cleanup();
  cleanupGitFixtures();
});

function fresh(
  env: Record<string, string> = {},
  update: TestUpdateOverrides = {},
  resources: TestCallerOverrides["resources"] = {},
): TestCaller {
  const caller = createTestCaller(env, { update, resources });
  callers.push(caller);
  return caller;
}

const registryAnswers = (version: string) => async () => Response.json({ version });

/** Um daemon supervisionado, na 0.6.1, e um registry que diz 0.7.0 já lido. */
async function supervisedWithNewVersion(update: TestUpdateOverrides = {}): Promise<TestCaller> {
  const caller = fresh(
    { LUMEM_SUPERVISOR: "launchd" },
    { current: "0.6.1", request: registryAnswers("0.7.0") as typeof fetch, ...update },
  );
  await caller.update.check.checkNow();
  return caller;
}

describe("system.updateStatus", () => {
  it("updateStatus reports the last check", async () => {
    // Antes da primeira verificação: a versão que roda, e nada mais.
    const before = fresh();
    expect(await before.api.system.updateStatus()).toEqual({
      current: LUMEM_VERSION,
      latest: null,
      checkedAt: null,
      updateAvailable: false,
      supervised: false,
      checkEnabled: true,
      autoUpdate: "off",
      lastError: null,
    });

    // Depois: `0.6.1 → 0.7.0` é versão nova, e a hora da leitura vem junto.
    const newer = fresh({}, { current: "0.6.1", request: registryAnswers("0.7.0") as typeof fetch });
    await newer.update.check.checkNow();
    const status = await newer.api.system.updateStatus();
    expect(status).toMatchObject({ current: "0.6.1", latest: "0.7.0", updateAvailable: true });
    expect(status.checkedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));

    // A mesma versão, e uma que o registry tem **menor** que a de quem roda (um
    // build local, ou uma publicação desfeita): nenhuma das duas é atualização.
    const same = fresh({}, { current: "0.7.0", request: registryAnswers("0.7.0") as typeof fetch });
    await same.update.check.checkNow();
    expect((await same.api.system.updateStatus()).updateAvailable).toBe(false);

    const ahead = fresh({}, { current: "0.8.0", request: registryAnswers("0.7.0") as typeof fetch });
    await ahead.update.check.checkNow();
    const behind = await ahead.api.system.updateStatus();
    expect(behind.latest).toBe("0.7.0");
    expect(behind.updateAvailable).toBe(false);
  });

  it("says the check is off when the environment or the setting turns it off", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ version: "0.7.0" }));

    // `LUMEM_NO_UPDATE_CHECK=1`: nenhuma requisição, e o status diz por quê.
    const forced = fresh({ LUMEM_NO_UPDATE_CHECK: "1" }, { request });
    await forced.update.check.checkNow();
    expect((await forced.api.system.updateStatus()).checkEnabled).toBe(false);

    // O interruptor de `/settings`, na linha do banco.
    const off = fresh({}, { request });
    await off.api.system.setSettings({ updateCheck: false });
    await off.update.check.checkNow();
    expect((await off.api.system.updateStatus()).checkEnabled).toBe(false);

    expect(request).not.toHaveBeenCalled();
  });
});

describe("system.settings", () => {
  it("settings says when the environment forces the check off", async () => {
    const forced = fresh({ LUMEM_NO_UPDATE_CHECK: "1" });
    expect(await forced.api.system.settings()).toEqual({
      updateCheck: true,
      autoUpdate: "off",
      updateCheckForcedOff: true,
    });

    // Só o `1`: `0` e vazio não desligam nada, e o painel não pode dizer que sim.
    expect((await fresh({ LUMEM_NO_UPDATE_CHECK: "0" }).api.system.settings()).updateCheckForcedOff).toBe(
      false,
    );
    expect((await fresh().api.system.settings()).updateCheckForcedOff).toBe(false);
  });

  it("setSettings writes the single row", async () => {
    const caller = fresh();

    const written = await caller.api.system.setSettings({ updateCheck: false, autoUpdate: "idle" });
    expect(written).toEqual({ updateCheck: false, autoUpdate: "idle", updateCheckForcedOff: false });
    expect(await caller.api.system.settings()).toEqual(written);

    // Uma segunda chamada troca os valores e **não** cria outra linha.
    const second = await caller.api.system.setSettings({ updateCheck: true, autoUpdate: "off" });
    expect(second).toEqual({ updateCheck: true, autoUpdate: "off", updateCheckForcedOff: false });
    expect(caller.db.select().from(daemonSettings).all()).toEqual([
      { id: 1, updateCheck: 1, autoUpdate: "off" },
    ]);

    // E só o campo que veio muda: o outro fica como estava.
    await caller.api.system.setSettings({ autoUpdate: "idle" });
    expect(await caller.api.system.settings()).toMatchObject({ updateCheck: true, autoUpdate: "idle" });
  });

  it("setSettings refuses an unknown autoUpdate", async () => {
    const caller = fresh();
    await caller.api.system.setSettings({ autoUpdate: "idle" });

    await expect(
      // @ts-expect-error -- o valor que o enum não deixa passar, e que chega de fora
      caller.api.system.setSettings({ autoUpdate: "always" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // A linha não mudou: nem o campo recusado, nem nenhum outro.
    expect(await caller.api.system.settings()).toMatchObject({ updateCheck: true, autoUpdate: "idle" });
  });
});

describe("system.update", () => {
  it("update installs with the owning package manager", async () => {
    const install = vi.fn(async (_command: InstallCommand) => new Promise<number>(() => {}));
    const caller = await supervisedWithNewVersion({ install, manager: "pnpm" });
    const hold = vi.spyOn(caller.acpManager, "setUpdating");

    const answer = await caller.api.system.update();

    expect(answer).toEqual({ started: true });
    expect(install).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["add", "--global", `${PACKAGE_NAME}@0.7.0`],
    });
    // A porta de prompt fechou **antes** de o instalador rodar.
    expect(hold).toHaveBeenCalledWith(true);
    expect(hold.mock.invocationCallOrder[0]).toBeLessThan(install.mock.invocationCallOrder[0]!);
  });

  it("update refuses while anything is live", async () => {
    const install = vi.fn(async (_command: InstallCommand) => 0);
    const caller = await supervisedWithNewVersion({ install });
    const hold = vi.spyOn(caller.acpManager, "setUpdating");
    vi.spyOn(caller.acpManager, "liveTurns").mockReturnValue([
      { sessionId: "a", startedAt: new Date() },
      { sessionId: "b", startedAt: new Date() },
    ]);
    vi.spyOn(caller.scripts, "runningCount").mockResolvedValue(1);

    await expect(caller.api.system.update()).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/2 turnos.*1 script/),
    });

    // Nada começou: nem instalador, nem a porta fechada.
    expect(install).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
    expect((await caller.api.system.updateStatus()).lastError).toBeNull();
  });

  it("update refuses a second install", async () => {
    const install = vi.fn(async (_command: InstallCommand) => new Promise<number>(() => {}));
    const caller = await supervisedWithNewVersion({ install });

    await caller.api.system.update();
    await expect(caller.api.system.update()).rejects.toMatchObject({ code: "CONFLICT" });

    expect(install).toHaveBeenCalledTimes(1);
  });

  it("update needs a supervisor and a newer version", async () => {
    const install = vi.fn(async (_command: InstallCommand) => 0);

    // Versão nova e nenhum supervisor: sair com 0 não faria ninguém subir a nova.
    const alone = fresh({}, { current: "0.6.1", request: registryAnswers("0.7.0") as typeof fetch, install });
    await alone.update.check.checkNow();
    await expect(alone.api.system.update()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    // Supervisor e nada a instalar: nem a primeira leitura chegou, e depois dela a
    // versão é a mesma.
    const nothing = fresh(
      { LUMEM_SUPERVISOR: "systemd" },
      { current: "0.7.0", request: registryAnswers("0.7.0") as typeof fetch, install },
    );
    await expect(nothing.api.system.update()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await nothing.update.check.checkNow();
    await expect(nothing.api.system.update()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(install).not.toHaveBeenCalled();
  });

  it("reports a failed install in updateStatus, and lets the next one start", async () => {
    // O desfecho do C29 visto de fora do instalador: o que a tela lê.
    let code = 1;
    const install = vi.fn(async (_command: InstallCommand) => code);
    const caller = await supervisedWithNewVersion({ install });

    await caller.api.system.update();
    await vi.waitFor(async () => {
      expect((await caller.api.system.updateStatus()).lastError).toContain("1");
    });

    code = 0;
    await expect(caller.api.system.update()).resolves.toEqual({ started: true });
  });
});

describe("system.resources", () => {
  it("resources answers the groups and the largest processes through the router", async () => {
    const MB = 1024 * 1024;
    const caller = fresh({}, {}, {
      read: async () => [
        { pid: process.pid, ppid: 1, rssBytes: 100 * MB, cpuSeconds: 4, command: "/opt/node/bin/node" },
        // Fora da árvore do daemon: nunca entra.
        { pid: 1, ppid: 0, rssBytes: 900 * MB, cpuSeconds: 4, command: "/sbin/launchd" },
      ],
    });

    const resources = await caller.api.system.resources();

    expect(resources.groups).toEqual({
      // A primeira amostra do processo: sem taxa.
      daemon: { cpuPercent: null, rssBytes: 100 * MB },
      agents: { cpuPercent: null, rssBytes: 0 },
      terminals: { cpuPercent: null, rssBytes: 0 },
    });
    expect(resources.top).toEqual([{ label: "node", pid: process.pid, cpuPercent: null, rssBytes: 100 * MB }]);
    // ISO, porque o tRPC daqui não tem transformador.
    expect(new Date(resources.sampledAt).toISOString()).toBe(resources.sampledAt);
  });
});

describe("system.status", () => {
  it("status summarises what the shell needs", async () => {
    // Uma sessão cujo turno pede permissão e fica esperando: é o único estado em que
    // um agente parado espera uma pessoa (AC 45).
    const acpManager = new AcpManager({
      spawner: () =>
        fakeAgentProcess({
          prompt: async (_text, turn) => {
            void turn.requestPermission({
              toolCall: { toolCallId: "tc-1", title: "Bash rm -rf" },
              options: [{ optionId: "allow", name: "permitir uma vez", kind: "allow_once" }],
            });
            await turn.cancelled;
            return "cancelled";
          },
        }).process,
      isAvailable: () => true,
    });
    const caller = createTestCaller(
      { LUMEM_SUPERVISOR: "launchd" },
      { acpManager, update: { current: "0.6.1", request: registryAnswers("0.7.0") as typeof fetch } },
    );
    callers.push(caller);
    await caller.update.check.checkNow();

    // Ocioso: a versão e o que o serviço diz, e nenhum turno nem pedido.
    await expect(caller.api.system.status()).resolves.toEqual({
      version: "0.6.1",
      protocolVersion: 1,
      supervised: true,
      updateAvailable: true,
      liveTurns: 0,
      attention: false,
    });

    const info = await acpManager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });
    const events: { type: string; requestId?: string }[] = [];
    acpManager.onEvent(info.id, ({ event }) => events.push(event as { type: string; requestId?: string }));
    const turn = acpManager.prompt(info.id, "vai");
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === "permission_request")).toBe(true);
    });

    // Um turno em voo, e ele está esperando uma pessoa.
    await expect(caller.api.system.status()).resolves.toMatchObject({ liveTurns: 1, attention: true });

    // Respondido o pedido, o turno segue: em voo ainda, mas ninguém precisa dele.
    const request = events.find((event) => event.type === "permission_request")!;
    acpManager.respondToPermission(info.id, request.requestId!, "allow");
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === "permission_resolved")).toBe(true);
    });
    await expect(caller.api.system.status()).resolves.toMatchObject({ attention: false });

    acpManager.cancel(info.id);
    await turn.catch(() => undefined);
    await expect(caller.api.system.status()).resolves.toMatchObject({ liveTurns: 0, attention: false });
  });
});

describe("system.live", () => {
  it("live names each turn by session and checkout, and counts open shells", async () => {
    const acpManager = new AcpManager({
      spawner: () =>
        fakeAgentProcess({
          prompt: async (_text, turn) => {
            await turn.cancelled;
            return "cancelled";
          },
        }).process,
      isAvailable: () => true,
    });
    // A cópia gerenciada do adaptador: é a única que o daemon lança.
    const state = tempDir("lumem-state-");
    const bin = join(state, ADAPTERS_DIR_NAME, CLAUDE_ADAPTER.id, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const managed = join(bin, CLAUDE_ADAPTER.command);
    writeFileSync(managed, "#!/bin/sh\ncat\n");
    chmodSync(managed, 0o755);
    const caller = createTestCaller({ LUMEM_STATE_DIR: state, SHELL: "/bin/sh" }, { acpManager });
    callers.push(caller);
    const workspace = await caller.api.workspace.create({ name: "pessoal" });
    const project = await caller.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "lumem-os",
    });
    const tree = await caller.api.worktree.create({ projectId: project.id, name: "bandung" });
    const config = await createAgentConfigRepository(caller.db).create({
      name: "claude",
      command: managed,
      adapterVersion: CLAUDE_ADAPTER.pinnedVersion,
    });

    // Nada rodando: a lista é vazia e nenhum terminal está aberto.
    await expect(caller.api.system.live()).resolves.toEqual({ turns: [], openTerminals: 0 });

    const agent = await caller.api.session.createAgent({
      scopeType: "worktree",
      scopeId: tree.id,
      agentConfigId: config.id,
    });
    // Uma sessão de agente ociosa **não** é um turno em voo.
    await expect(caller.api.system.live()).resolves.toEqual({ turns: [], openTerminals: 0 });

    const turn = acpManager.prompt(agent.id, "vai");
    await vi.waitFor(async () => {
      expect((await caller.api.system.live()).turns).toHaveLength(1);
    });
    await caller.api.session.createShell({ scopeType: "worktree", scopeId: tree.id });
    await caller.api.session.createShell({ scopeType: "project", scopeId: project.id });

    const live = await caller.api.system.live();
    expect(live.turns).toEqual([
      { sessionId: agent.id, label: "Claude · lumem-os/bandung", startedAt: expect.any(String) },
    ]);
    expect(new Date(live.turns[0]!.startedAt).toISOString()).toBe(live.turns[0]!.startedAt);
    // Dois shells abertos; o agente não é terminal.
    expect(live.openTerminals).toBe(2);

    acpManager.cancel(agent.id);
    await turn.catch(() => undefined);
  });
});
