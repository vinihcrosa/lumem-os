import { RequestError } from "@agentclientprotocol/sdk";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeAgentProcess, type FakeAgentScript } from "../testing/acp-fake-agent.js";
import { AcpManager } from "./AcpManager.js";
import { createMemoryTranscriptStore } from "./TranscriptStore.js";

/**
 * The probe: one handshake, no session, no tokens (onboarding F3.3, D4).
 *
 * Against the fake agent, like the rest of the transport. The one thing a fake
 * cannot answer — whether the *real* adapter still reports `agentInfo` in this
 * shape — is the marked integration test in `AcpManager.integration.test.ts`.
 */

const dirs: string[] = [];

function cwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-probe-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness(script: FakeAgentScript = {}) {
  const fake = fakeAgentProcess(script);
  const manager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
  return { fake, manager };
}

describe("AcpManager.probe", () => {
  it("reports what the adapter said, not what the daemon assumed", async () => {
    const { manager } = harness();

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(report.protocolVersion).toBe(1);
    expect(report.agentInfo).toEqual({ name: "fake-agent", title: "Fake Agent", version: "0.0.0" });
    // Empty is the answer the spike measured, and it is what turns the auth step
    // into a report instead of a choice (F3.6).
    expect(report.authMethods).toEqual([]);
    expect(report.capabilities).toContain("loadSession");
    expect(report.acpSessionId).not.toBe("");
    expect(report.modes).toContain("plan");
  });

  it("carries the adapter version, which is what gets pinned", async () => {
    // This is the whole reason the probe exists rather than a `--version` call:
    // `agent_config.adapter_version` is typed by hand today, and the protocol
    // has been handing the answer over the entire time (F3.5).
    const { manager } = harness({
      initialize: () => ({ agentInfo: { name: "claude-agent-acp", version: "0.69.0" } }),
    });

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(report.agentInfo?.version).toBe("0.69.0");
  });

  it("survives an adapter that declares no agentInfo", async () => {
    const { manager } = harness({ initialize: () => ({ agentInfo: undefined }) });

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    // Null, not a guess: the screen says "não declarou" and the version stays
    // something a person types.
    expect(report.agentInfo).toBeNull();
  });

  it("leaves no session behind", async () => {
    const { manager } = harness();

    await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(manager.list()).toHaveLength(0);
  });

  it("tells no exit watcher, because there is no row to update", async () => {
    // The session store subscribes to exits to write `exited` on a row. A probe
    // has no row, so notifying would have it look for an id it never wrote.
    const { manager } = harness();
    const watcher = vi.fn();
    manager.watchExits(watcher);

    await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(watcher).not.toHaveBeenCalled();
  });

  it("kills the adapter even when session/new refuses", async () => {
    // The path where an adapter demands authentication first is the one where a
    // leaked process is easiest to produce and hardest to notice.
    const { manager, fake } = harness({
      newSession: () => {
        throw new Error("authentication required");
      },
    });

    await expect(manager.probe({ command: "claude-agent-acp", cwd: cwd() })).rejects.toThrow();
    await expect(fake.killed).resolves.toBeUndefined();
  });

  it("kills the adapter after a successful probe", async () => {
    const { manager, fake } = harness();

    await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    await expect(fake.killed).resolves.toBeUndefined();
  });

  it("refuses a protocol version it does not speak, in a sentence", async () => {
    const { manager } = harness({ initialize: () => ({ protocolVersion: 99 }) });

    await expect(manager.probe({ command: "claude-agent-acp", cwd: cwd() })).rejects.toThrow(
      /versão 99/,
    );
  });

  it("refuses a command that is not installed before spawning anything", async () => {
    const fake = fakeAgentProcess();
    const manager = new AcpManager({ spawner: () => fake.process, isAvailable: () => false });

    await expect(manager.probe({ command: "claude-agent-acp", cwd: cwd() })).rejects.toThrow(
      /claude-agent-acp/,
    );
  });

  it("reports the authentication methods an adapter does demand", async () => {
    const { manager } = harness({
      initialize: () => ({
        authMethods: [
          {
            id: "claude-login",
            name: "Claude subscription",
            description: "Use Claude subscription",
            type: "terminal",
            args: ["--cli", "auth", "login", "--claudeai"],
          },
        ],
      }),
    });

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(report.authMethods).toEqual([
      {
        id: "claude-login",
        name: "Claude subscription",
        description: "Use Claude subscription",
        type: "terminal",
        // No `_meta["terminal-auth"]`, so there is no binary to run: the adapter
        // means "itself", and guessing which of its names is on this machine is
        // the guess that produced the wrong install command in the first place.
        command: null,
        args: ["--cli", "auth", "login", "--claudeai"],
        label: null,
      },
    ]);
  });

  it("takes the command from the adapter when it hands one over", async () => {
    // `_meta["terminal-auth"]` is the honest source: the adapter knows which
    // binary of itself logs in, and the daemon runs exactly that.
    const { manager } = harness({
      initialize: () => ({
        authMethods: [
          {
            id: "claude-ai-login",
            name: "Claude Subscription",
            type: "terminal",
            args: ["--cli"],
            _meta: {
              "terminal-auth": {
                command: "/usr/bin/node",
                args: ["/opt/bin/claude-agent-acp", "--cli", "auth", "login", "--claudeai"],
                label: "Claude Login",
              },
            },
          },
        ],
      }),
    });

    const [method] = (await manager.probe({ command: "claude-agent-acp", cwd: cwd() })).authMethods;

    expect(method).toMatchObject({
      command: "/usr/bin/node",
      args: ["/opt/bin/claude-agent-acp", "--cli", "auth", "login", "--claudeai"],
      label: "Claude Login",
    });
  });

  it("reports auth_required instead of failing, because it is an answer", async () => {
    // It is the whole reason the login panel exists, and the only way to know a
    // credential is missing without spending a turn to find out.
    const { manager } = harness({
      // The SDK's own refusal, not a hand-rolled one: a plain Error crosses the
      // wire as an internal error, and it is the *code* that means "log in".
      newSession: () => {
        throw RequestError.authRequired();
      },
    });

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(report.authRequired).toBe(true);
    expect(report.acpSessionId).toBe("");
    // And the handshake still reported everything before it.
    expect(report.agentInfo?.version).toBe("0.0.0");
  });

  it("says a session is fine when session/new answered", async () => {
    const { manager } = harness();

    expect((await manager.probe({ command: "claude-agent-acp", cwd: cwd() })).authRequired).toBe(
      false,
    );
  });
});

/** O select de modelo do fake, com o `currentValue` que cada troca devolve. */
function modelOption(currentValue: string) {
  return {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue,
    options: [
      { value: "opus[1m]", name: "opus[1m]" },
      { value: "sonnet", name: "sonnet" },
    ],
  };
}

const EFFORT_OPTION = {
  id: "effort",
  name: "Effort",
  category: "thought_level",
  type: "select",
  currentValue: "high",
  options: [
    { value: "low", name: "Low" },
    { value: "high", name: "High" },
  ],
};

describe("AcpManager.probe — a primeira fonte do catálogo (033 T8)", () => {
  it("devolve as opções do session/new, normalizadas, sem esperar notificação", async () => {
    const { manager } = harness();

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    // O `mode` entra dobrado dos `modes`, como numa sessão de verdade: o
    // catálogo guarda a mesma forma que a pílula já lê.
    expect(report.configOptions.map((option) => option.id)).toEqual(["mode", "model"]);
    const model = report.configOptions.find((option) => option.id === "model");
    expect(model?.currentValue).toBe("opus[1m]");
    expect(model?.choices.map((choice) => choice.value)).toEqual(["opus[1m]", "sonnet"]);
    expect(report.configOptions.find((option) => option.id === "mode")?.currentValue).toBe(
      "default",
    );
  });

  it("percorre cada modelo e guarda as opções que cada um tem (M1a)", async () => {
    const asked: [string, string | boolean][] = [];
    const { manager } = harness({
      setConfigOption: (configId, value) => {
        asked.push([configId, value]);
        // `sonnet` perde o effort, como o `haiku` do Claude de verdade.
        return (
          value === "sonnet" ? [modelOption("sonnet")] : [modelOption("opus[1m]"), EFFORT_OPTION]
        ) as never;
      },
    });

    const report = await manager.probe(
      { command: "claude-agent-acp", cwd: cwd() },
      { walkModels: true },
    );

    expect(asked).toEqual([
      ["model", "opus[1m]"],
      ["model", "sonnet"],
    ]);
    expect(Object.keys(report.optionsByModel).sort()).toEqual(["opus[1m]", "sonnet"]);
    expect(report.optionsByModel["opus[1m]"]?.map((option) => option.id)).toContain("effort");
    expect(report.optionsByModel["sonnet"]?.map((option) => option.id)).not.toContain("effort");
    expect(report.optionsByModel["sonnet"]?.find((o) => o.id === "model")?.currentValue).toBe(
      "sonnet",
    );
    // O padrão do ACP (Q8) não é o último modelo percorrido: o `configOptions`
    // continua sendo o do `session/new`.
    expect(report.configOptions.find((o) => o.id === "model")?.currentValue).toBe("opus[1m]");
  });

  it("não percorre modelo nenhum sem que peçam: o login só quer saber se sobe", async () => {
    const asked: string[] = [];
    const { manager } = harness({
      setConfigOption: (_configId, value) => {
        asked.push(String(value));
        return [modelOption("opus[1m]")] as never;
      },
    });

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(asked).toEqual([]);
    expect(report.optionsByModel).toEqual({});
    expect(report.configOptions.map((option) => option.id)).toContain("model");
  });

  it("um modelo que recusa a troca não derruba os outros", async () => {
    const { manager } = harness({
      setConfigOption: (_configId, value) => {
        if (value === "sonnet") throw new Error("modelo indisponível nesta conta");
        return [modelOption("opus[1m]"), EFFORT_OPTION] as never;
      },
    });

    const report = await manager.probe(
      { command: "claude-agent-acp", cwd: cwd() },
      { walkModels: true },
    );

    expect(Object.keys(report.optionsByModel)).toEqual(["opus[1m]"]);
  });

  it("sem credencial não há opção nenhuma para relatar", async () => {
    const { manager } = harness({
      newSession: () => {
        throw RequestError.authRequired();
      },
    });

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(report.configOptions).toEqual([]);
    expect(report.optionsByModel).toEqual({});
  });

  it("não grava transcrição nem avisa observador, mesmo com o adaptador falando no meio", async () => {
    /*
     * O achado da discovery: `emit()` grava no `TranscriptStore` e `emitConfig`
     * avisa o `SessionStore`, que tentaria gravar numa linha que não existe. O
     * probe fica vivo mais tempo agora — um `set_config_option` por modelo —, e
     * o `available_commands_update` do Claude chega exatamente nessa janela.
     */
    const transcripts = createMemoryTranscriptStore();
    const append = vi.spyOn(transcripts, "append");
    const fake = fakeAgentProcess({
      setConfigOption: () => {
        void fake.sendRaw({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "fake-acp-session",
            update: {
              sessionUpdate: "available_commands_update",
              availableCommands: [{ name: "review", description: "Review the diff" }],
            },
          },
        });
        void fake.sendRaw({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "fake-acp-session",
            update: { sessionUpdate: "config_option_update", configOptions: [EFFORT_OPTION] },
          },
        });
        return [modelOption("opus[1m]")] as never;
      },
    });
    const manager = new AcpManager({
      spawner: () => fake.process,
      isAvailable: () => true,
      transcripts,
    });
    const events = vi.fn();
    const configs = vi.fn();
    manager.watchEvents(events);
    manager.watchConfig(configs);

    await manager.probe({ command: "claude-agent-acp", cwd: cwd() });
    // Uma volta a mais no laço de eventos: a notificação e a resposta viajam no
    // mesmo cano, e o SDK não promete tratar uma antes da outra.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(append).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    expect(configs).not.toHaveBeenCalled();
  });

  it("o killAll alcança um probe em voo", async () => {
    /*
     * O probe não está no mapa de sessões, e até aqui não precisava: ele vivia
     * o tempo de uma requisição. O aquecimento do boot o põe em segundo plano,
     * e um desligamento no meio dele deixaria um adaptador de 243 MB sem
     * ninguém apontando para ele.
     */
    let killed = false;
    let resolveExit: (value: { exitCode: number | null; signal: string | null }) => void = () => {};
    const silent = {
      // Um adaptador que nunca responde ao `initialize`.
      stdin: new WritableStream<Uint8Array>(),
      stdout: new ReadableStream<Uint8Array>(),
      exited: new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
        resolveExit = resolve;
      }),
      kill() {
        killed = true;
        resolveExit({ exitCode: 0, signal: null });
      },
    };
    const manager = new AcpManager({
      spawner: () => silent,
      isAvailable: () => true,
      handshakeTimeoutMs: 5_000,
    });

    const probing = manager.probe({ command: "claude-agent-acp", cwd: cwd() });
    probing.catch(() => undefined);
    await manager.killAll();

    expect(killed).toBe(true);
  });
});
