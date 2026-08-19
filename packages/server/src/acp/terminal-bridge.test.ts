import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PtyManager } from "../pty/PtyManager.js";
import { createTerminalBridge, type TerminalBridge } from "./terminal-bridge.js";

/**
 * The terminal the agent asks for, against real processes.
 *
 * Real because the whole claim of F3.2 is that nothing new was built: the bridge
 * either drives the `PtyManager` the daemon already owns or it does not, and a fake
 * manager would only prove the bridge calls methods with the right names.
 *
 * What is worth asserting beyond "it runs a command" is the lifecycle, because that
 * is where an orphan comes from: who ends the process, who forgets it, and what
 * happens to both when the agent dies.
 */

const managers: PtyManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
});

function bridge(): { bridge: TerminalBridge; ptyManager: PtyManager } {
  const ptyManager = new PtyManager();
  managers.push(ptyManager);
  return { bridge: createTerminalBridge({ ptyManager, cwd: tmpdir() }), ptyManager };
}

/** Runs a command and waits until its output has landed in the scrollback. */
async function run(
  handle: TerminalBridge,
  command: string,
  args: string[],
): Promise<{ terminalId: string; ptySessionId: string }> {
  const created = handle.create({ command, args });
  return created;
}

describe("creating", () => {
  it("runs the command through the manager the daemon already owns", async () => {
    // F3.2. No second process manager, which is what makes the embedded terminal a
    // matter of pointing an existing component at an existing endpoint.
    const { bridge: handle, ptyManager } = bridge();

    const { ptySessionId } = await run(handle, "sh", ["-c", "echo ola"]);

    expect(ptyManager.get(ptySessionId)).toBeDefined();
    await vi.waitFor(() => expect(ptyManager.snapshot(ptySessionId)).toContain("ola"));
  });

  it("hands back two ids, and keeps them apart", async () => {
    // The agent's id is protocol vocabulary and the session id is ours. Conflating
    // them would leak one into the other's error messages.
    const { bridge: handle } = bridge();

    const { terminalId, ptySessionId } = await run(handle, "sh", ["-c", "true"]);

    expect(terminalId).not.toBe(ptySessionId);
    expect(handle.ptySessionIds()).toEqual([ptySessionId]);
  });

  it("runs in the session's checkout unless the agent says otherwise", async () => {
    /*
     * `pwd -P`, not `pwd`. On macOS `/var` is a symlink to `/private/var`, and the
     * shell reports the *logical* path it was given while `realpath` reports the
     * physical one — so the two disagree about the same directory. `-P` asks the
     * shell for the physical answer, which is the one worth comparing.
     */
    const root = await realpath(tmpdir());
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "pwd -P"]);

    await vi.waitFor(() => expect(handle.output(terminalId).output).toContain(root));
  });

  it("runs where the agent asks, when it asks", async () => {
    const root = await realpath(tmpdir());
    const elsewhere = await mkdtemp(join(root, "lumem-term-cwd-"));
    const { bridge: handle } = bridge();

    const { terminalId } = handle.create({
      command: "sh",
      args: ["-c", "pwd -P"],
      cwd: elsewhere,
    });

    await vi.waitFor(() => expect(handle.output(terminalId).output).toContain(elsewhere));
    await rm(elsewhere, { recursive: true, force: true });
  });

  it("refuses an empty command instead of spawning a shell that does nothing", async () => {
    const { bridge: handle } = bridge();

    expect(() => handle.create({ command: "   " })).toThrow(/vazio/);
  });
});

describe("reading the output", () => {
  it("gives back what the command printed", async () => {
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "echo primeira && echo segunda"]);

    await vi.waitFor(() => expect(handle.output(terminalId).output).toContain("segunda"));
    expect(handle.output(terminalId).output).toContain("primeira");
  });

  it("says the output was truncated once the scrollback has dropped a line", async () => {
    /*
     * The difference between the agent reasoning about partial output and reasoning
     * about output it thinks is whole. The ring buffer drops the oldest lines rather
     * than growing, and nothing else would tell the agent that.
     */
    const ptyManager = new PtyManager({ scrollbackLines: 5 });
    managers.push(ptyManager);
    const handle = createTerminalBridge({ ptyManager, cwd: tmpdir() });
    const { terminalId } = handle.create({
      command: "sh",
      args: ["-c", "for i in 1 2 3 4 5 6 7 8 9 10; do echo linha$i; done"],
    });

    await vi.waitFor(() => expect(handle.output(terminalId).truncated).toBe(true));
    expect(handle.output(terminalId).output).not.toContain("linha1\r");
  });

  it("reports no truncation for output that fits", async () => {
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "echo curto"]);

    await vi.waitFor(() => expect(handle.output(terminalId).output).toContain("curto"));
    expect(handle.output(terminalId).truncated).toBe(false);
  });

  it("carries the exit status once there is one", async () => {
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "exit 3"]);

    await vi.waitFor(() => expect(handle.output(terminalId).exitStatus).not.toBeNull());
    expect(handle.output(terminalId).exitStatus).toMatchObject({ exitCode: 3 });
  });

  it("reports no exit status while it is still running", async () => {
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "sleep 30"]);

    expect(handle.output(terminalId).exitStatus).toBeNull();
  });

  it("refuses a terminal it never created", () => {
    const { bridge: handle } = bridge();

    expect(() => handle.output("fantasma")).toThrow(/nenhum terminal/);
  });
});

describe("waiting for the exit", () => {
  it("resolves with the real exit code", async () => {
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "exit 7"]);

    await expect(handle.waitForExit(terminalId)).resolves.toMatchObject({ exitCode: 7 });
  });

  it("answers a question asked after the fact", async () => {
    // The agent may ask once the process is long gone, and a promise that resolved
    // before it subscribed still has to answer.
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "exit 0"]);
    await handle.waitForExit(terminalId);

    await expect(handle.waitForExit(terminalId)).resolves.toMatchObject({ exitCode: 0 });
  });

  it("resolves when the terminal is killed rather than hanging", async () => {
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "sleep 30"]);

    const waiting = handle.waitForExit(terminalId);
    handle.kill(terminalId);

    await expect(waiting).resolves.toBeDefined();
  });
});

describe("ending it", () => {
  it("kills a running terminal", async () => {
    const { bridge: handle, ptyManager } = bridge();
    const { terminalId, ptySessionId } = await run(handle, "sh", ["-c", "sleep 30"]);

    handle.kill(terminalId);

    await vi.waitFor(() => expect(ptyManager.get(ptySessionId)?.state).toBe("exited"));
  });

  it("forgets a released terminal, in both places", async () => {
    // Otherwise the record outlives every reference to it and `list()` grows for the
    // life of the daemon.
    const { bridge: handle, ptyManager } = bridge();
    const { terminalId, ptySessionId } = await run(handle, "sh", ["-c", "exit 0"]);
    await handle.waitForExit(terminalId);

    handle.release(terminalId);

    expect(handle.ptySessionIds()).toEqual([]);
    expect(ptyManager.get(ptySessionId)).toBeUndefined();
    expect(() => handle.output(terminalId)).toThrow(/nenhum terminal/);
  });

  it("refuses to release a terminal that is still running", async () => {
    // Releasing something still running is the agent losing track of it, and the
    // manager's own refusal is the right one to surface.
    const { bridge: handle } = bridge();
    const { terminalId } = await run(handle, "sh", ["-c", "sleep 30"]);

    expect(() => handle.release(terminalId)).toThrow(/still running/);
  });

  it("lists every terminal still open, for cleanup", async () => {
    const { bridge: handle } = bridge();
    await run(handle, "sh", ["-c", "sleep 30"]);
    await run(handle, "sh", ["-c", "sleep 30"]);

    expect(handle.ptySessionIds()).toHaveLength(2);
  });
});
