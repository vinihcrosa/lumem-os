import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { openTestDb, type TestDb } from "./db/testing.js";
import { PtyManager } from "./pty/PtyManager.js";
import { SHUTDOWN_SIGNALS } from "./signals.js";

const started: FastifyInstance[] = [];
const managers: PtyManager[] = [];
const databases: TestDb[] = [];

async function boot(
  overrides: {
    port?: string;
    beforeClose?: () => Promise<void>;
    ptyManager?: PtyManager;
  } = {},
) {
  const signalSource = new EventEmitter();
  const exit = vi.fn();
  // Port 0 lets the OS pick a free one — no fixed port to collide with.
  const config = loadConfig({ LUMEM_PORT: overrides.port ?? "0" });
  // Never the real ~/.lumem/lumem.db: a test suite must not write to the
  // developer's own state.
  const database = openTestDb();
  databases.push(database);

  const app = await bootstrap({
    config,
    signalSource,
    exit,
    logger: false,
    database,
    ...(overrides.ptyManager ? { ptyManager: overrides.ptyManager } : {}),
    ...(overrides.beforeClose ? { beforeClose: overrides.beforeClose } : {}),
  });
  started.push(app);

  return { app, signalSource, exit, config };
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((app) => app.close()));
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
  for (const database of databases.splice(0)) database.cleanup();
});

describe("bootstrap", () => {
  it("listens on the configured host", async () => {
    const { app } = await boot();

    expect(app.server.listening).toBe(true);
    expect(app.server.address()).toMatchObject({ address: "127.0.0.1" });
  });

  it("serves the trpc router once listening", async () => {
    const { app } = await boot();

    const response = await app.inject({ method: "GET", url: "/trpc/health" });

    expect(response.statusCode).toBe(200);
  });

  it("registers a shutdown handler for every signal", async () => {
    // Deleting the installSignalHandlers call used to pass every gate.
    const { signalSource } = await boot();

    for (const signal of SHUTDOWN_SIGNALS) {
      expect(signalSource.listenerCount(signal)).toBe(1);
    }
  });

  it("closes the server when a signal arrives", async () => {
    const { app, signalSource, exit } = await boot();

    signalSource.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(app.server.listening).toBe(false);
  });

  it("kills the PTY children before closing the server", async () => {
    // app.close() knows nothing about them, so without this SIGTERM orphans
    // every shell the daemon spawned.
    const ptyManager = new PtyManager();
    managers.push(ptyManager);
    const { signalSource, exit } = await boot({ ptyManager });
    const session = ptyManager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() });

    signalSource.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(ptyManager.get(session.id)?.state).toBe("exited");
  });

  it("runs beforeClose while the server is still listening", async () => {
    let appRef: FastifyInstance | undefined;
    const seen: { calls: number; listeningWhenCalled?: boolean } = { calls: 0 };

    const { app, signalSource, exit } = await boot({
      beforeClose: async () => {
        seen.calls += 1;
        seen.listeningWhenCalled = appRef?.server.listening;
      },
    });
    appRef = app;

    signalSource.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(seen.calls).toBe(1);
    expect(seen.listeningWhenCalled).toBe(true);
    expect(app.server.listening).toBe(false);
  });

  it("still exits non-zero when beforeClose throws", async () => {
    const { signalSource, exit } = await boot({
      beforeClose: () => Promise.reject(new Error("pty kill failed")),
    });

    signalSource.emit("SIGTERM");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });

  it("exits non-zero when the port is already taken", async () => {
    const first = await boot();
    const address = first.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const second = await boot({ port: String(port) });

    expect(second.exit).toHaveBeenCalledWith(1);
    expect(second.app.server.listening).toBe(false);
  });
});
