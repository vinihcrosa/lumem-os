import { PACKAGE_NAME, type InstallCommand } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import { createDaemonSettingsRepository } from "../repositories/daemonSettings.js";
import { runConveyorLoop } from "../tasks/conveyor-loop.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { createTestCaller, type TestCaller, type TestUpdateOverrides } from "../testing/caller.js";
import { AUTO_UPDATE_INTERVAL_MS, createAutoUpdate, type AutoUpdate } from "./auto.js";

/**
 * O tique de 60 s que atualiza sozinho quando ocioso (`038`, Parte 5).
 *
 * O registry, o gerenciador de pacote e o desligamento são os de mentira de sempre
 * (`createTestCaller`); o `AcpManager`, o `ScriptRunner`, o instalador e o banco são
 * os de verdade. O relógio é injetado: o que está sob teste é **o que um tique
 * decide**, e nenhuma pergunta daqui precisa esperar 60 segundos.
 */

const callers: TestCaller[] = [];

afterEach(async () => {
  for (const caller of callers.splice(0)) await caller.cleanup();
});

const registryAnswers = (version: string) => async () => Response.json({ version });

interface Built {
  caller: TestCaller;
  auto: AutoUpdate;
  install: ReturnType<typeof vi.fn<(command: InstallCommand) => Promise<number>>>;
}

/** Um daemon com a versão nova já lida, o `auto_update` no valor dado e o tique na mão. */
async function build({
  current = "0.6.1",
  latest = "0.7.0",
  autoUpdate = "idle",
  supervisor = "launchd",
  acpManager,
  install = vi.fn(async (_command: InstallCommand) => new Promise<number>(() => {})),
}: {
  current?: string;
  latest?: string;
  autoUpdate?: "off" | "idle";
  supervisor?: string | null;
  acpManager?: AcpManager;
  install?: Built["install"];
} = {}): Promise<Built> {
  const update: TestUpdateOverrides = {
    current,
    request: registryAnswers(latest) as typeof fetch,
    install,
  };
  const caller = createTestCaller(
    supervisor === null ? {} : { LUMEM_SUPERVISOR: supervisor },
    { update, ...(acpManager === undefined ? {} : { acpManager }) },
  );
  callers.push(caller);
  await caller.update.check.checkNow();
  await caller.api.system.setSettings({ autoUpdate });
  const auto = createAutoUpdate({
    supervised: caller.config.supervised,
    update: caller.update,
    settings: createDaemonSettingsRepository(caller.db),
    busy: { acpManager: caller.acpManager, scripts: caller.scripts },
  });
  return { caller, auto, install };
}

/** Um `setInterval` que devolve o disparo na mão de quem testa. */
function manualClock() {
  let fire: (() => void) | null = null;
  const schedule = ((callback: () => void) => {
    fire = callback;
    return { unref: () => undefined } as unknown as NodeJS.Timeout;
  }) as unknown as typeof globalThis.setInterval;
  return { schedule, tick: () => fire?.() };
}

/** Um agente cujo turno `hold` só acaba quando o teste manda; qualquer outro texto acaba na hora. */
function manager() {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const acpManager = new AcpManager({
    spawner: () =>
      fakeAgentProcess({
        prompt: async (text) => {
          if (text === "hold") await held;
          return "end_turn";
        },
      }).process,
    isAvailable: () => true,
  });
  return { acpManager, release };
}

describe("the automatic install", () => {
  it("installs on an idle tick only when the setting is idle", async () => {
    // O padrão: `off`. O mesmo tique, com tudo o mais em ordem, não faz nada.
    const off = await build({ autoUpdate: "off" });
    const closing = vi.spyOn(off.caller.acpManager, "setUpdating");
    expect((await off.caller.api.system.settings()).autoUpdate).toBe("off");

    await off.auto.tick();

    expect(off.install).not.toHaveBeenCalled();
    expect(closing).not.toHaveBeenCalled();
    expect(off.caller.update.installer.installing()).toBe(false);

    // `idle`: o **mesmo instalador** do `system.update` — o gerenciador dono da cópia,
    // a versão que o `latest` disse — e a porta de prompt fechou antes dele rodar.
    const idle = await build({ autoUpdate: "idle" });
    const hold = vi.spyOn(idle.caller.acpManager, "setUpdating");

    await idle.auto.tick();

    expect(idle.install).toHaveBeenCalledTimes(1);
    expect(idle.install).toHaveBeenCalledWith({
      command: "npm",
      args: ["install", "--global", `${PACKAGE_NAME}@0.7.0`],
    });
    expect(hold).toHaveBeenCalledWith(true);
    expect(hold.mock.invocationCallOrder[0]).toBeLessThan(idle.install.mock.invocationCallOrder[0]!);
    expect(idle.caller.update.installer.installing()).toBe(true);

    // Ligar em `/settings` vale no tique seguinte, sem reiniciar: o valor é lido a cada tique.
    const later = await build({ autoUpdate: "off" });
    await later.auto.tick();
    expect(later.install).not.toHaveBeenCalled();
    await later.caller.api.system.setSettings({ autoUpdate: "idle" });
    await later.auto.tick();
    expect(later.install).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a supervisor, a newer version, or with a script running", async () => {
    // Sair com 0 sem supervisor deixaria o Lumem parado, e a instalação já teria feito.
    const alone = await build({ supervisor: null });
    await alone.auto.tick();
    expect(alone.install).not.toHaveBeenCalled();

    // Nada a instalar: a mesma versão.
    const same = await build({ current: "0.7.0", latest: "0.7.0" });
    await same.auto.tick();
    expect(same.install).not.toHaveBeenCalled();

    // Um script de projeto rodando conta como ocupado, como no `system.update`.
    const scripted = await build();
    vi.spyOn(scripted.caller.scripts, "runningCount").mockResolvedValue(1);
    await scripted.auto.tick();
    expect(scripted.install).not.toHaveBeenCalled();
    expect(scripted.caller.update.installer.installing()).toBe(false);
  });

  it("does not start a second install while one runs", async () => {
    const { auto, install } = await build();

    await auto.tick();
    await auto.tick();

    expect(install).toHaveBeenCalledTimes(1);
  });

  it("waits for idle without draining", async () => {
    const { acpManager, release } = manager();
    const { caller, auto, install } = await build({ acpManager });
    const closing = vi.spyOn(acpManager, "setUpdating");
    // A esteira de verdade **anda** enquanto o daemon espera: o relógio dela pergunta
    // se deve pausar, e enquanto nada instala, a resposta é não.
    await caller.api.workspace.create({ name: "pessoal" });
    const clock = manualClock();
    const conveyorTick = vi.fn(async (_workspaceId: string) => 0);
    const stop = runConveyorLoop({
      db: caller.db,
      conveyor: { tick: conveyorTick, send: async () => undefined },
      setInterval: clock.schedule,
      paused: () => caller.update.installer.installing(),
    });

    const busy = await acpManager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });
    const other = await acpManager.spawn({ command: "claude-agent-acp", cwd: "/repos/lorebase" });
    const turn = acpManager.prompt(busy.id, "hold");
    await vi.waitFor(() => {
      expect(acpManager.liveTurns()).toHaveLength(1);
    });

    // Um turno em voo por três tiques: nenhum instala, e a porta de prompt nunca fechou.
    for (let tick = 1; tick <= 3; tick += 1) {
      await auto.tick();
      expect(install).not.toHaveBeenCalled();
      expect(closing).not.toHaveBeenCalled();

      // Esperando, o daemon **aceita** prompt (AC 73): outra sessão responde.
      await expect(acpManager.prompt(other.id, "outro")).resolves.toBe("end_turn");

      // E a esteira despacha: a passada de cada tique dela chega ao `tick` da esteira.
      clock.tick();
      await vi.waitFor(() => {
        expect(conveyorTick).toHaveBeenCalledTimes(tick);
      });
    }

    // O turno acabou (`turn_end`): o tique **seguinte** dispara, e só ele.
    release();
    await turn;
    await vi.waitFor(() => {
      expect(acpManager.liveTurns()).toHaveLength(0);
    });
    expect(install).not.toHaveBeenCalled();

    await auto.tick();

    expect(install).toHaveBeenCalledTimes(1);
    expect(closing).toHaveBeenCalledWith(true);
    stop();
  });

  it("never crosses a major after 1.0 on its own", async () => {
    // `1.4.0 → 2.0.0`: quebra que a pessoa tem de aceitar. Não instala, e a tela
    // continua dizendo que há versão nova — o botão manual é o caminho.
    const across = await build({ current: "1.4.0", latest: "2.0.0" });

    await across.auto.tick();
    await across.auto.tick();

    expect(across.install).not.toHaveBeenCalled();
    expect(across.caller.update.installer.installing()).toBe(false);
    expect(across.caller.update.updateAvailable()).toBe(true);
    expect(await across.caller.api.system.updateStatus()).toMatchObject({
      current: "1.4.0",
      latest: "2.0.0",
      updateAvailable: true,
    });

    // Sob 0.x qualquer aumento vale: `0.6.1 → 0.7.0` instala.
    const minor = await build({ current: "0.6.1", latest: "0.7.0" });
    await minor.auto.tick();
    expect(minor.install).toHaveBeenCalledTimes(1);

    // Saltar para a 1.0 a partir da 0.x também é `0.x`: instala. E depois da 1.0, o
    // mesmo major segue instalando sozinho.
    const toOne = await build({ current: "0.9.2", latest: "1.0.0" });
    await toOne.auto.tick();
    expect(toOne.install).toHaveBeenCalledTimes(1);

    const sameMajor = await build({ current: "1.4.0", latest: "1.5.0" });
    await sameMajor.auto.tick();
    expect(sameMajor.install).toHaveBeenCalledTimes(1);

    // O botão manual não muda: cruzar o major é a pessoa quem manda.
    await expect(across.caller.api.system.update()).resolves.toEqual({ started: true });
  });

  it("the conveyor dispatches nothing while it installs", async () => {
    let finish = (): void => undefined;
    const running = new Promise<number>((resolve) => {
      finish = () => {
        resolve(1);
      };
    });
    const install = vi.fn(async (_command: InstallCommand) => running);
    const { caller, auto } = await build({ install });
    await caller.api.workspace.create({ name: "pessoal" });
    const clock = manualClock();
    const conveyorTick = vi.fn(async (_workspaceId: string) => 0);
    const stop = runConveyorLoop({
      db: caller.db,
      conveyor: { tick: conveyorTick, send: async () => undefined },
      setInterval: clock.schedule,
      paused: () => caller.update.installer.installing(),
    });

    // Antes da instalação: a passada anda.
    clock.tick();
    await vi.waitFor(() => {
      expect(conveyorTick).toHaveBeenCalledTimes(1);
    });

    // A instalação automática começou e o npm ainda roda.
    await auto.tick();
    expect(caller.update.installer.installing()).toBe(true);

    // Uma tarefa nova seria uma tentativa contada, uma worktree e uma sessão abertas
    // para um prompt que a porta fechada recusa: a passada não dispara nem a leitura.
    clock.tick();
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(conveyorTick).toHaveBeenCalledTimes(1);

    // Falhou: o daemon segue de pé na versão velha e a esteira volta a andar.
    finish();
    await vi.waitFor(() => {
      expect(caller.update.installer.installing()).toBe(false);
    });
    clock.tick();
    await vi.waitFor(() => {
      expect(conveyorTick).toHaveBeenCalledTimes(2);
    });
    stop();
  });

  it("arms a sixty second clock that does not hold the process, and stops it", async () => {
    const { caller } = await build();
    const timer = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    const schedule = vi.fn(() => timer) as unknown as typeof globalThis.setInterval;
    const cancel = vi.fn() as unknown as typeof globalThis.clearInterval;
    const auto = createAutoUpdate({
      supervised: caller.config.supervised,
      update: caller.update,
      settings: createDaemonSettingsRepository(caller.db),
      busy: { acpManager: caller.acpManager, scripts: caller.scripts },
      setInterval: schedule,
      clearInterval: cancel,
    });

    auto.start();
    // Uma segunda chamada não arma um segundo relógio.
    auto.start();

    expect(AUTO_UPDATE_INTERVAL_MS).toBe(60_000);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(timer.unref).toHaveBeenCalled();

    auto.stop();
    expect(cancel).toHaveBeenCalledWith(timer);
  });
});
