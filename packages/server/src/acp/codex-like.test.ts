import type { AcpEvent } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { codexLikeScript, fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { AcpManager } from "./AcpManager.js";

/**
 * O segundo agente, no perfil que a fase 0 mediu.
 *
 * A F3 da `second-agent` era código e virou teste, e este arquivo é o motivo:
 * medido em 2026-09-06, um turno inteiro do `codex-acp@1.10.0` atravessou o
 * `translate.ts`, o `conversation-model.ts` e o `UsageFooter` **sem uma linha de
 * mudança e sem um `warn`**. A fronteira estava no lugar certo — e o que passa
 * sem teste é exatamente o que volta a quebrar.
 *
 * Contra o agente falso, e não contra o adaptador: a token zero, determinístico,
 * e capaz de perguntar o que o Codex real não é (um agente sem `loadSession`, um
 * que não reporta consumo nenhum). O adaptador de verdade tem o seu, marcado, em
 * `AcpManager.codex.integration.test.ts`.
 */

const managers: AcpManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
});

async function start(script = codexLikeScript(), log = { warn: vi.fn() }) {
  const fake = fakeAgentProcess(script);
  const manager = new AcpManager({
    spawner: () => fake.process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
    log: log as unknown as { warn: () => void },
  });
  managers.push(manager);

  const info = await manager.spawn({
    command: "codex-acp",
    cwd: "/repos/lorebase",
    adapterVersion: "1.10.0",
  });

  const events: AcpEvent[] = [];
  manager.onEvent(info.id, ({ event }) => events.push(event));

  return { manager, info, events, log, fake };
}

describe("a codex-like handshake", () => {
  it("reports the label from the title, because the name is an npm coordinate", async () => {
    // §4.1: `agentInfo.name` is `@agentclientprotocol/codex-acp`. Anything that
    // shows a person which agent is talking has to use something else.
    const { info } = await start();
    expect(info.state).toBe("running");

    // O `probe` ganha um processo próprio: um `spawn` já ocupou o outro, e um
    // fake compartilhado entre os dois trava o stream — o que é a mesma coisa
    // que aconteceria com um processo de verdade.
    const probeFake = fakeAgentProcess(codexLikeScript());
    const prober = new AcpManager({
      spawner: () => probeFake.process,
      isAvailable: () => true,
      handshakeTimeoutMs: 2_000,
    });
    managers.push(prober);

    const report = await prober.probe({ command: "codex-acp", cwd: "/tmp" });

    expect(report.agentInfo).toMatchObject({ title: "Codex", version: "1.10.0" });
    // Nenhum método de login é `type: "terminal"` — a medição que tirou a
    // escolha de agente do primeiro acesso (§4.2, C3).
    expect(report.authMethods.map((method) => method.type)).toEqual(["unknown", "unknown"]);
    expect(report.authMethods.every((method) => method.command === null)).toBe(true);
  });

  it("carries the three categories no Lumem screen had ever seen", async () => {
    // The pills are generic by `category: string`, and this is the first time
    // that is verified rather than asserted in a comment.
    const { info } = await start();

    expect(info.configOptions.map((option) => option.category)).toEqual([
      "mode",
      "collaboration_mode",
      "model",
      "thought_level",
      "model_config",
    ]);
  });

  it("lets the agent own the mode, so the Lumem policy pill stays away", async () => {
    // `session-mode`, A1: one mode pill, never two. An agent with modes owns it.
    const { info } = await start();

    expect(info.mode).toBe("agent");
    expect(info.lumemMode).toBe("ask");
    expect(info.configOptions.some((option) => option.id === "mode")).toBe(true);
  });
});

describe("a codex-like turn", () => {
  it("reports usage with no rate limit and no cost, and never a zero", async () => {
    /*
     * C4, and the test the behaviour never had. Measured: Codex sends
     * `{ used, size }` and nothing else. `cost: 0` here would be the product
     * telling someone a paid turn was free.
     */
    const { manager, info, events } = await start();

    await manager.prompt(info.id, "oi");

    const usage = events.filter((event) => event.type === "usage");
    expect(usage).toEqual([
      { type: "usage", used: 21_971, size: 258_400, cost: null, rateLimit: null },
    ]);
  });

  it("says nothing about cost when the agent reports no usage at all", async () => {
    // The case Codex is *not*, and the one the rule was written for: no number
    // is the honest answer, and it is not zero.
    const { manager, info, events } = await start(codexLikeScript({ usage: false }));

    await manager.prompt(info.id, "oi");

    expect(events.some((event) => event.type === "usage")).toBe(false);
  });

  it("takes the slash commands from the notification, not from session/new", async () => {
    // §4.3: `availableCommands` is absent from the `session/new` response and
    // arrives as an update after the first prompt. A daemon that required it in
    // the response would show an empty `/` menu for this agent.
    const { manager, info, events } = await start();

    expect(events.some((event) => event.type === "commands")).toBe(false);
    await manager.prompt(info.id, "oi");

    const commands = events.find((event) => event.type === "commands");
    expect(commands).toMatchObject({
      commands: [
        { name: "plan", takesInput: false },
        { name: "review", takesInput: true },
      ],
    });
  });

  it("ignores `session_info_update` by name, without a warning", async () => {
    // It is in `translate.ts`'s IGNORED list, and this is what makes "ignored"
    // a fact: an unlisted variant would reach the user as a grey `unknown`, and
    // a `warn` per event would fill the log of every Codex turn.
    const { manager, info, events, log } = await start();

    await manager.prompt(info.id, "oi");

    expect(events.some((event) => event.type === "unknown")).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("asks the client for no file and no terminal", async () => {
    // §4.5: Codex reads and runs on its own and reports `tool_call`s. The
    // `fs-bridge` and the `terminal-bridge` are dead code for this agent, and a
    // test that pretended otherwise would be testing the fake.
    const { manager, info, events } = await start();

    await manager.prompt(info.id, "leia e rode");

    expect(events.some((event) => event.type === "permission_request")).toBe(false);
    expect(manager.get(info.id)?.state).toBe("running");
  });
});

describe("a codex-like agent that cannot load a session", () => {
  it("refuses to resume, with a sentence, instead of pretending", async () => {
    // Codex *can* load (§4.6) — the interesting case is the adapter that cannot,
    // which is the next one in the catalogue. What the protocol did not give is
    // not emulated.
    const fake = fakeAgentProcess(codexLikeScript({ loadSession: false }));
    const manager = new AcpManager({
      spawner: () => fake.process,
      isAvailable: () => true,
      handshakeTimeoutMs: 2_000,
    });
    managers.push(manager);

    await expect(
      manager.resume({
        command: "codex-acp",
        cwd: "/repos/lorebase",
        acpSessionId: "fake-codex-session",
      }),
    ).rejects.toMatchObject({ code: "BLOCKED" });
  });
});

describe("switching mode on a codex-like agent", () => {
  it("moves the mode and the option that mirrors it together", async () => {
    // §4.9, the defect phase 0 found: the agent that reports `mode` twice is the
    // one where updating half of it shows a stale selector.
    const { manager, info, events } = await start();

    await manager.setConfig(info.id, "mode", "read-only");

    expect(manager.get(info.id)?.mode).toBe("read-only");
    expect(
      manager.get(info.id)?.configOptions.find((option) => option.id === "mode")?.currentValue,
    ).toBe("read-only");
    expect(events.at(-1)).toMatchObject({ type: "config", mode: "read-only" });
  });
});
