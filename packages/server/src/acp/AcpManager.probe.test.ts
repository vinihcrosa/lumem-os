import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeAgentProcess, type FakeAgentScript } from "../testing/acp-fake-agent.js";
import { AcpManager } from "./AcpManager.js";

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
        authMethods: [{ id: "claude-login", name: "Claude subscription", description: null }],
      }),
    });

    const report = await manager.probe({ command: "claude-agent-acp", cwd: cwd() });

    expect(report.authMethods).toEqual([{ id: "claude-login", name: "Claude subscription" }]);
  });
});
