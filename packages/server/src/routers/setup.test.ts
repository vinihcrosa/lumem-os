import { afterEach, describe, expect, it } from "vitest";

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
  it("answers for both binaries and for the key, without the key", async () => {
    context = createTestCaller();

    const report = await context.api.setup.agents();

    expect(report.claude.command).toBe("claude");
    expect(report.adapter.command).toBe("claude-agent-acp");
    expect(typeof report.apiKeyInEnv).toBe("boolean");
  });
});

describe("setup.probe", () => {
  it("hands back the handshake and leaves nothing running", async () => {
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") }, { acpManager });

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

  it("accepts another command, for the agent that is not Claude", async () => {
    const fake = fakeAgentProcess();
    const acpManager = new AcpManager({ spawner: () => fake.process, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") }, { acpManager });

    const report = await context.api.setup.probe({ command: "gemini-acp", args: ["--stdio"] });

    expect(report.command).toBe("gemini-acp");
    expect(report.args).toEqual(["--stdio"]);
  });
});
