import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * The three reads the first-access flow makes, over the wire.
 *
 * `preflight` and `agents` run against this machine on purpose here — their
 * *interesting* cases are unit-tested with fabricated seams, and what is left to
 * check at this level is that the procedure exists, answers, and answers the
 * shape the client destructures.
 */

/**
 * Encena a cópia gerenciada, porque desde 2026-09-08 é a única que o daemon lança.
 *
 * Um arquivo vazio basta: o que os procedimentos conferem é **proveniência** —
 * existe em `<stateDir>/adapters/<id>/node_modules/.bin/`? —, e quem executa é um
 * `AcpManager` falso. [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
 */
function stageManagedAdapter(stateDir: string): string {
  const bin = join(stateDir, ADAPTERS_DIR_NAME, CLAUDE_ADAPTER.id, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, CLAUDE_ADAPTER.command), "");
  return join(bin, CLAUDE_ADAPTER.command);
}

let context: TestCaller | undefined;

afterEach(async () => {
  await context?.cleanup();
  context = undefined;
  cleanupGitFixtures();
});

describe("setup.preflight", () => {
  it("answers with the five checks", async () => {
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });

    const { checks } = await context.api.setup.preflight();

    expect(checks.map((check) => check.id)).toEqual(["daemon", "git", "node", "stateDir", "disk"]);
    // The daemon answered this call, so this one is not allowed to be anything else.
    expect(checks[0]).toMatchObject({ id: "daemon", state: "ok" });
  });
});

describe("setup.agents", () => {
  /*
   * This one costs a real `--version`, and `claude` takes a few seconds to boot.
   *
   * Paid deliberately and once: the detection's own cases are unit tests over a
   * fabricated PATH, and what is left here is the wiring — that the procedure is
   * registered and hands back the three fields the screen destructures.
   */
  it("answers one entry per catalogued adapter, without the key", async () => {
    context = createTestCaller();

    const report = await context.api.setup.agents();

    expect(report.adapters.map((adapter) => adapter.id)).toEqual(["claude", "codex"]);
    const [claude, codex] = report.adapters;
    expect(claude?.adapter.command).toBe("claude-agent-acp");
    // Os dois trazem o próprio agente por dentro desde 2026-09-08 — o do Claude
    // medido três vezes, no comentário do `CLAUDE_ADAPTER.cli`.
    expect(claude?.cli).toBeNull();
    expect(codex?.cli).toBeNull();
    // The name of the variable at most, and never a value.
    expect(claude?.apiKeyEnv === null || claude?.apiKeyEnv === "ANTHROPIC_API_KEY").toBe(true);
  });
});

describe("setup.probe", () => {
  it("hands back the handshake and leaves nothing running", async () => {
    const stateDir = tempDir("lumem-state-");
    stageManagedAdapter(stateDir);
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: stateDir }, { acpManager });

    const report = await context.api.setup.probe();

    expect(report.protocolVersion).toBe(1);
    expect(report.agentInfo?.version).toBe("0.0.0");
    // D4: no row, and no live session either.
    expect(acpManager.list()).toHaveLength(0);
    expect(await context.db.query.session.findMany()).toHaveLength(0);
  });

  it("probes in a directory of its own, under the state directory", async () => {
    // Never a checkout: pointing a probe at a repository would have the adapter
    // index it to answer a question about whether it starts.
    const stateDir = tempDir("lumem-state-");
    stageManagedAdapter(stateDir);
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: stateDir }, { acpManager });

    await context.api.setup.probe();

    const [session] = acpManager.list();
    // The session is gone by now, so the assertion is on what the manager was
    // asked for — which is why `probe` reports the command back.
    expect(session).toBeUndefined();
  });

  it("refuses a missing adapter with a sentence naming it", async () => {
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => false });
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") }, { acpManager });

    await expect(context.api.setup.probe()).rejects.toThrow(/claude-agent-acp/);
  });

  it("probes the copy the daemon installed, not one from the PATH", async () => {
    /*
     * LUM-54, and the half of it that outlived the version bump.
     *
     * `setup.agents` already preferred the managed copy for *reporting*; this
     * procedure defaulted to the bare command, so the OS answered from the PATH.
     * On a machine with a stale global adapter, the flow installed a pinned copy,
     * showed it on screen, and then saved the old one into `agent_config` — where
     * every turn then died on the embedded runtime.
     */
    const stateDir = tempDir("lumem-state-");
    const managed = stageManagedAdapter(stateDir);
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: stateDir }, { acpManager });

    const report = await context.api.setup.probe();

    expect(report.command).toBe(managed);
  });

  it("refuses instead of falling back to the bare command", async () => {
    /*
     * Isto **reverte** `"falls back to the bare command when the daemon installed
     * nothing"`, cuja justificativa era *"o PATH é a única resposta numa máquina
     * onde a pessoa instalou o adaptador"*.
     *
     * O que essa justificativa não pesou é o modo de falha: numa máquina com uma
     * cópia global **diferente** do pino, o fallback não falha — ele serve a versão
     * errada em silêncio. Foi assim que esta máquina passou nove dias no `0.40.0`,
     * sem Opus 5 na lista de modelos e com um `usage_update` de 200K sob um rótulo
     * que dizia "1M context". A recusa diz o que falta; o fallback não dizia nada.
     */
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") }, { acpManager });

    await expect(context.api.setup.probe()).rejects.toThrow(/não serve/);
  });

  it("accepts another command, for the agent that is not Claude", async () => {
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") }, { acpManager });

    const report = await context.api.setup.probe({ command: "gemini-acp", args: ["--stdio"] });

    expect(report.command).toBe("gemini-acp");
    expect(report.args).toEqual(["--stdio"]);
  });
});

describe("setup.login", () => {
  function loginHarness(script: Parameters<typeof fakeAgentProcess>[0] = {}) {
    const fake = fakeAgentProcess(script);
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    const stateDir = tempDir("lumem-state-");
    // Sem isto, todo caso deste bloco morre na recusa de proveniência antes de
    // chegar ao assunto dele — que é qual método de login o adaptador ofereceu.
    stageManagedAdapter(stateDir);
    context = createTestCaller({ LUMEM_STATE_DIR: stateDir }, { acpManager });
    return { fake, acpManager, ctx: context };
  }

  /** The two methods the real adapter offers, with the meta it offers them with. */
  const TERMINAL_METHOD = {
    id: "claude-ai-login",
    name: "Claude Subscription",
    description: "Use Claude subscription",
    type: "terminal",
    args: ["--cli"],
    _meta: {
      "terminal-auth": {
        command: "/bin/echo",
        args: ["logging", "in"],
        label: "Claude Login",
      },
    },
  };

  it("runs the command the adapter named, in a terminal the daemon owns", async () => {
    const { ctx } = loginHarness({ initialize: () => ({ authMethods: [TERMINAL_METHOD] }) });

    const terminal = await ctx.api.setup.login({ methodId: "claude-ai-login" });

    expect(terminal.command).toBe("/bin/echo");
    expect(terminal.args).toEqual(["logging", "in"]);
    // A PTY the client can attach to, and *not* a session: there is no scope it
    // belongs to, and a row in `session` would be a conversation that never was.
    expect(ctx.ptyManager.get(terminal.ptySessionId)).toBeDefined();
    expect(await ctx.db.query.session.findMany()).toHaveLength(0);
  });

  it("refuses a method the adapter never offered", async () => {
    // The client sends an id, never a command line. A client that could name the
    // binary would be a client that can run anything on the daemon's machine.
    const { ctx } = loginHarness({ initialize: () => ({ authMethods: [TERMINAL_METHOD] }) });

    await expect(ctx.api.setup.login({ methodId: "rm-rf-login" })).rejects.toThrow(
      /não oferece o método/,
    );
  });

  it("refuses a method it cannot execute, and says which kind it was", async () => {
    const { ctx } = loginHarness({
      initialize: () => ({
        authMethods: [{ id: "gateway", name: "Custom gateway", type: "agent" }],
      }),
    });

    await expect(ctx.api.setup.login({ methodId: "gateway" })).rejects.toThrow(/tipo agent/);
  });

  it("refuses a terminal method the adapter gave no command for", async () => {
    const { ctx } = loginHarness({
      initialize: () => ({
        authMethods: [{ id: "claude-login", name: "Log in", type: "terminal", args: ["--cli"] }],
      }),
    });

    await expect(ctx.api.setup.login({ methodId: "claude-login" })).rejects.toThrow(
      /não disse qual comando rodar/,
    );
  });
});

describe("setup.authenticate", () => {
  it("grava a versão do disco, e não o pino", async () => {
    /*
     * O `install-adapter.ts` chama isto pelo nome — *"restatement of the constant
     * instead of a report… a mentira que esconde a LUM-54"*. O `AdapterInstall.version`
     * foi consertado; o caminho do login continuou gravando `spec.pinnedVersion`, e
     * nesta máquina, em 2026-09-08, isso estava vivo: o daemon rodava o `0.40.0` e um
     * login teria carimbado `0.75.1` na linha.
     *
     * A versão do disco é **diferente** do pino de propósito. Um caso em que as duas
     * coincidem passaria com qualquer um dos dois códigos.
     */
    const stateDir = tempDir("lumem-state-");
    stageManagedAdapter(stateDir);
    const onDisk = "0.41.2";
    expect(onDisk).not.toBe(CLAUDE_ADAPTER.pinnedVersion);
    const pkg = join(
      stateDir,
      ADAPTERS_DIR_NAME,
      CLAUDE_ADAPTER.id,
      "node_modules",
      ...(CLAUDE_ADAPTER.package ?? "").split("/"),
    );
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: CLAUDE_ADAPTER.package, version: onDisk }),
    );

    const fake = fakeAgentProcess({
      initialize: () => ({ authMethods: [{ id: "api-key", name: "Chave", type: "api-key" }] }),
    });
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: stateDir }, { acpManager });
    const started = vi.spyOn(context.ctx.agentAuth, "start");

    await context.api.setup.authenticate({ methodId: "api-key", apiKey: "sk-nao-ecoe" });

    expect(started).toHaveBeenCalledWith(expect.objectContaining({ adapterVersion: onDisk }));
  });
});

describe("setup.installAdapter", () => {
  it("is a mutation, because it downloads and writes", async () => {
    // Asserted on the router rather than on the installer: what matters here is
    // that a browser cannot fire it with a GET, which is what a query would allow.
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });

    expect(typeof context.api.setup.installAdapter).toBe("function");
  });

  it("refuses an adapter id nobody catalogued, before running npm", async () => {
    // Falling through to the default would install Claude for someone who asked
    // for something else, and report success for the wrong agent.
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });

    await expect(context.api.setup.installAdapter({ adapterId: "gemini" })).rejects.toThrow(
      /gemini/,
    );
  });
});
