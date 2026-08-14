import { EventEmitter } from "node:events";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { SHUTDOWN_SIGNALS } from "./signals.js";

const started: FastifyInstance[] = [];

async function boot(overrides: { port?: string } = {}) {
  const signalSource = new EventEmitter();
  const exit = vi.fn();
  // Port 0 lets the OS pick a free one — no fixed port to collide with.
  const config = loadConfig({ LUMEM_PORT: overrides.port ?? "0" });

  const app = await bootstrap({ config, signalSource, exit, logger: false });
  started.push(app);

  return { app, signalSource, exit, config };
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((app) => app.close()));
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

  it("exits non-zero when the port is already taken", async () => {
    const first = await boot();
    const address = first.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const second = await boot({ port: String(port) });

    expect(second.exit).toHaveBeenCalledWith(1);
    expect(second.app.server.listening).toBe(false);
  });
});
