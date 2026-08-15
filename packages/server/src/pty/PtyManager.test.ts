import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "../errors.js";
import { PtyManager } from "./PtyManager.js";

const managers: PtyManager[] = [];

function makeManager(scrollbackLines?: number): PtyManager {
  const manager = new PtyManager(
    scrollbackLines === undefined ? {} : { scrollbackLines },
  );
  managers.push(manager);
  return manager;
}

/** Waits until the session's buffer contains `needle`, or fails the test. */
async function waitForOutput(manager: PtyManager, id: string, needle: string): Promise<string> {
  await vi.waitFor(
    () => {
      expect(manager.snapshot(id)).toContain(needle);
    },
    { timeout: 10_000, interval: 20 },
  );
  return manager.snapshot(id);
}

async function waitForExit(manager: PtyManager, id: string): Promise<void> {
  await vi.waitFor(
    () => {
      expect(manager.get(id)?.state).toBe("exited");
    },
    { timeout: 10_000, interval: 20 },
  );
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
});

describe("spawn", () => {
  it("runs a command and captures its output", async () => {
    const manager = makeManager();

    const session = manager.spawn({ command: "echo", args: ["hello-pty"], cwd: tmpdir() });
    await waitForOutput(manager, session.id, "hello-pty");

    expect(session.state).toBe("running");
  });

  it("runs in the requested working directory", async () => {
    const manager = makeManager();

    const session = manager.spawn({ command: "pwd", args: [], cwd: tmpdir() });
    const output = await waitForOutput(manager, session.id, "/");

    // macOS reports /private/var/... for /var/...; match the leaf either way.
    expect(output).toContain(tmpdir().replace(/^\/private/, ""));
  });

  it("passes the requested environment through", async () => {
    const manager = makeManager();

    const session = manager.spawn({
      command: "sh",
      args: ["-c", "echo $LUMEM_TEST_VAR"],
      cwd: tmpdir(),
      env: { LUMEM_TEST_VAR: "from-env" },
    });

    await waitForOutput(manager, session.id, "from-env");
  });

  it("reports the exit code of a process that finishes", async () => {
    const manager = makeManager();

    const session = manager.spawn({ command: "sh", args: ["-c", "exit 3"], cwd: tmpdir() });
    await waitForExit(manager, session.id);

    expect(manager.get(session.id)?.exitCode).toBe(3);
  });

  it("keeps the buffer readable after the process is gone", async () => {
    const manager = makeManager();

    const session = manager.spawn({
      command: "sh",
      args: ["-c", "echo last-words"],
      cwd: tmpdir(),
    });
    await waitForExit(manager, session.id);

    expect(manager.snapshot(session.id)).toContain("last-words");
  });

  it("rejects a working directory that does not exist", () => {
    // node-pty does not complain: it produces a PTY that exits 1 and writes
    // nothing, which reaches the user as a terminal that closed for no reason.
    const manager = makeManager();

    expect(() => manager.spawn({ command: "echo", cwd: "/nonexistent-dir-xyz" })).toThrow(
      DomainError,
    );
    expect(() => manager.spawn({ command: "echo", cwd: "/nonexistent-dir-xyz" })).toThrow(
      /working directory does not exist/,
    );
  });

  it("does not throw for a missing binary — it exits silently instead", async () => {
    // Documented, not desired. This is exactly why the PRD requires checking
    // an agent's command against PATH before offering to launch it (F6.5):
    // the daemon has no other way to tell "not installed" from "crashed".
    const manager = makeManager();

    const session = manager.spawn({
      command: "definitely-not-a-real-binary-xyz",
      cwd: tmpdir(),
    });
    await waitForExit(manager, session.id);

    expect(manager.get(session.id)?.exitCode).toBe(1);
    expect(manager.snapshot(session.id)).toBe("");
  });

  it("rejects an empty command", () => {
    const manager = makeManager();

    expect(() => manager.spawn({ command: "   ", cwd: tmpdir() })).toThrow(/must not be empty/);
  });

  it("keeps sessions isolated from each other", async () => {
    const manager = makeManager();

    const a = manager.spawn({ command: "echo", args: ["aaa"], cwd: tmpdir() });
    const b = manager.spawn({ command: "echo", args: ["bbb"], cwd: tmpdir() });

    await waitForOutput(manager, a.id, "aaa");
    await waitForOutput(manager, b.id, "bbb");

    expect(manager.snapshot(a.id)).not.toContain("bbb");
    expect(manager.snapshot(b.id)).not.toContain("aaa");
  });
});

describe("write", () => {
  it("delivers input to the process", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "cat", cwd: tmpdir() });

    manager.write(session.id, "round-trip\n");

    await waitForOutput(manager, session.id, "round-trip");
  });

  it("refuses to write to a session that exited", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "exit 0"], cwd: tmpdir() });
    await waitForExit(manager, session.id);

    expect(() => manager.write(session.id, "x")).toThrow(/has exited/);
  });

  it("refuses an unknown session", () => {
    const manager = makeManager();

    expect(() => manager.write("nope", "x")).toThrow(/no session/);
  });
});

describe("resize", () => {
  it("propagates the new size to the process", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", cwd: tmpdir(), cols: 80, rows: 24 });

    manager.resize(session.id, 120, 40);
    manager.write(session.id, "tput cols\n");

    await waitForOutput(manager, session.id, "120");
    expect(manager.get(session.id)?.cols).toBe(120);
  });

  it.each([
    [0, 24],
    [80, 0],
    [-1, 24],
    [80.5, 24],
  ])("rejects the size %sx%s", (cols, rows) => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", cwd: tmpdir() });

    expect(() => manager.resize(session.id, cols, rows)).toThrow(/invalid size/);
  });

  it("is a no-op on an exited session", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "exit 0"], cwd: tmpdir() });
    await waitForExit(manager, session.id);

    expect(() => manager.resize(session.id, 100, 30)).not.toThrow();
  });
});

describe("kill", () => {
  it("ends a running session", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() });

    manager.kill(session.id);

    await waitForExit(manager, session.id);
  });

  it("is idempotent", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() });

    manager.kill(session.id);
    await waitForExit(manager, session.id);

    expect(() => manager.kill(session.id)).not.toThrow();
  });
});

describe("listeners", () => {
  it("streams data to a subscriber", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "cat", cwd: tmpdir() });
    const chunks: string[] = [];

    manager.onData(session.id, (chunk) => chunks.push(chunk));
    manager.write(session.id, "streamed\n");

    await vi.waitFor(() => expect(chunks.join("")).toContain("streamed"), { timeout: 10_000 });
  });

  it("stops delivering after unsubscribe, without killing the process", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "cat", cwd: tmpdir() });
    const chunks: string[] = [];

    const unsubscribe = manager.onData(session.id, (chunk) => chunks.push(chunk));
    manager.write(session.id, "before\n");
    await vi.waitFor(() => expect(chunks.join("")).toContain("before"), { timeout: 10_000 });

    unsubscribe();
    manager.write(session.id, "after\n");
    await waitForOutput(manager, session.id, "after");

    // Detaching is what closing a browser tab does. The process must not care.
    expect(chunks.join("")).not.toContain("after");
    expect(manager.get(session.id)?.state).toBe("running");
  });

  it("survives a listener that throws", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "cat", cwd: tmpdir() });
    const good: string[] = [];

    manager.onData(session.id, () => {
      throw new Error("broken client");
    });
    manager.onData(session.id, (chunk) => good.push(chunk));
    manager.write(session.id, "resilient\n");

    // One broken client must not starve the others.
    await vi.waitFor(() => expect(good.join("")).toContain("resilient"), { timeout: 10_000 });
  });

  it("notifies on exit", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "exit 7"], cwd: tmpdir() });
    const exits: number[] = [];

    manager.onExit(session.id, ({ exitCode }) => exits.push(exitCode));

    await vi.waitFor(() => expect(exits).toEqual([7]), { timeout: 10_000 });
  });

  it("notifies immediately when the session already exited", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "exit 2"], cwd: tmpdir() });
    await waitForExit(manager, session.id);

    const exits: number[] = [];
    manager.onExit(session.id, ({ exitCode }) => exits.push(exitCode));

    // A client attaching after the fact must learn the outcome, not wait forever.
    expect(exits).toEqual([2]);
  });
});

describe("scrollback", () => {
  it("caps the buffer at the configured line count", async () => {
    const manager = makeManager(20);
    const session = manager.spawn({
      command: "sh",
      args: ["-c", "for i in $(seq 1 200); do echo line$i; done"],
      cwd: tmpdir(),
    });
    await waitForExit(manager, session.id);

    const lines = manager.snapshot(session.id).split("\n");

    expect(lines.length).toBeLessThanOrEqual(20);
    expect(manager.snapshot(session.id)).toContain("line200");
    expect(manager.snapshot(session.id)).not.toContain("line1\n");
  });
});

describe("bookkeeping", () => {
  it("lists live sessions", async () => {
    const manager = makeManager();
    const a = manager.spawn({ command: "sh", cwd: tmpdir() });
    const b = manager.spawn({ command: "sh", cwd: tmpdir() });

    expect(manager.list().map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("returns undefined for an unknown session instead of throwing", () => {
    const manager = makeManager();

    expect(manager.get("nope")).toBeUndefined();
  });

  it("hands out copies, so callers cannot mutate internal state", () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", cwd: tmpdir() });

    session.state = "exited";

    expect(manager.get(session.id)?.state).toBe("running");
  });

  it("refuses to forget a session that is still running", () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() });

    expect(() => manager.forget(session.id)).toThrow(/still running/);
  });

  it("forgets an exited session", async () => {
    const manager = makeManager();
    const session = manager.spawn({ command: "sh", args: ["-c", "exit 0"], cwd: tmpdir() });
    await waitForExit(manager, session.id);

    manager.forget(session.id);

    expect(manager.get(session.id)).toBeUndefined();
  });
});

describe("killAll", () => {
  it("kills every running session and resolves once they are gone", async () => {
    const manager = makeManager();
    const a = manager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() });
    const b = manager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() });

    await manager.killAll();

    // This is what bootstrap's beforeClose calls: a daemon exiting without it
    // leaves orphaned shells attached to nothing.
    expect(manager.get(a.id)?.state).toBe("exited");
    expect(manager.get(b.id)?.state).toBe("exited");
  });

  it("resolves when there is nothing to kill", async () => {
    const manager = makeManager();

    await expect(manager.killAll()).resolves.toBeUndefined();
  });

  it("gives up on a process that refuses to die instead of hanging forever", async () => {
    const manager = makeManager();
    // Ignoring SIGTERM is what a wedged agent CLI does.
    manager.spawn({
      command: "sh",
      args: ["-c", "trap '' TERM; sleep 30"],
      cwd: tmpdir(),
    });

    await expect(manager.killAll(300)).resolves.toBeUndefined();
  });
});
