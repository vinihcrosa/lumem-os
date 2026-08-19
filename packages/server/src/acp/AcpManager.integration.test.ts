import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { isCommandAvailable } from "../agents/availability.js";
import { AcpManager } from "./AcpManager.js";

/**
 * The one test that talks to the real adapter.
 *
 * Everything else about the transport runs against a fake agent, and that is
 * what keeps the suite free. This exists for the one thing a fake cannot check:
 * that the *actual* adapter still answers the shape `translate.ts` and
 * `acp-protocol.ts` were written against. It is the detector for the risk the
 * PRD names — `claude-agent-acp` is a third party with a near-daily release
 * cadence, and the version is pinned precisely because it moves.
 *
 * **It spends nothing.** The spike measured the handshake at zero tokens:
 * `initialize` and `session/new` create no inference. It stops there. A single
 * `session/prompt` would cost roughly 39k tokens of system prompt before saying
 * a word, and a suite that bills the user is a suite nobody runs.
 *
 * Skipped when the adapter is not installed, like a machine with no `claude`.
 * A red test on a machine that simply lacks a binary teaches people to ignore
 * red.
 */

const ADAPTER = "claude-agent-acp";
const installed = isCommandAvailable(ADAPTER);

const dirs: string[] = [];
const managers: AcpManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function cwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-acp-real-"));
  dirs.push(dir);
  return dir;
}

describe.skipIf(!installed)(`${ADAPTER} handshake`, () => {
  it("answers initialize and session/new in the shape this daemon expects", async () => {
    const manager = new AcpManager({ handshakeTimeoutMs: 30_000 });
    managers.push(manager);

    const info = await manager.spawn({ command: ADAPTER, cwd: cwd() });

    // The adapter named the session. Without this there is nothing to prompt.
    expect(info.acpSessionId).not.toBe("");
    expect(info.state).toBe("running");

    // §2.4 of the PRD: modes are protocol data, not our invention. The set can
    // grow between versions, so the assertion is that the ones the UI relies on
    // are there — `default` because a session has to start somewhere, `plan`
    // because the prototype gives it its own colour.
    const modeOption = info.configOptions.find((option) => option.id === "mode");
    const modes = (modeOption?.choices ?? []).map((choice) => choice.value);
    expect(modes).toContain("default");
    expect(modes).toContain("plan");
    expect(modes).toContain(info.mode);

    // The model lives inside `configOptions`, not in a field of its own. If a
    // future adapter moves it, this is what says so — and every model selector
    // in the UI would otherwise render empty with no explanation.
    const modelOption = info.configOptions.find((option) => option.id === "model");
    expect(info.model).not.toBe("");
    expect((modelOption?.choices ?? []).map((choice) => choice.value)).toContain(info.model);

    // A13: the description is the agent's own string, carried verbatim. Its
    // presence is what the UI shows next to each option.
    expect(
      (modeOption?.choices ?? []).some((choice) => (choice.description ?? "").length > 0),
    ).toBe(true);
  });

  it("produced no conversation, which is what makes this test free", async () => {
    // The claim the file's whole cost rests on, stated as an assertion rather
    // than as a comment: a handshake that started emitting events would mean it
    // had started a turn, and the next person to add a case here should find
    // that out from a red test.
    const manager = new AcpManager({ handshakeTimeoutMs: 30_000 });
    managers.push(manager);

    const info = await manager.spawn({ command: ADAPTER, cwd: cwd() });

    expect(manager.transcript(info.id)).toEqual([]);
  });

  it("uses the local credential and asks for nothing", async () => {
    // §2.1: `authMethods: []` plus a successful `session/new` is what proves the
    // subscription path works — no API key, no second login. The day that
    // changes, this is where it shows, and it is the finding that would send the
    // whole feature back to PTY.
    const manager = new AcpManager({ handshakeTimeoutMs: 30_000 });
    managers.push(manager);

    await expect(manager.spawn({ command: ADAPTER, cwd: cwd() })).resolves.toMatchObject({
      state: "running",
    });
  });
});

describe.skipIf(installed)(`${ADAPTER} handshake`, () => {
  it("is skipped because the adapter is not installed", () => {
    // Not a silent skip: a suite that quietly drops its only real-world check
    // looks exactly like a suite that has one.
    expect(installed).toBe(false);
  });
});
