import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";

import { PTY_SESSION_PARAM, PTY_WS_PATH } from "@lumem/shared";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createServer } from "../server.js";

/**
 * The WebSocket half of phase 1 (PRD §2.2, §8).
 *
 * A real listener and a raw `ws` client, because the thing under test is what
 * happens **before** the handshake: a refused socket has to come back as an HTTP
 * status, never as an open connection that is then closed. The PRD names the
 * mutation this file exists to catch — take the guard out of the upgrade router
 * and every refusal below turns into an `open` event.
 *
 * Only `/pty` is exercised: the router is shared with `/acp`, and the guard runs
 * before the path is even looked at, so one endpoint proves both.
 */

let app: FastifyInstance;
let ptyManager: PtyManager;
let database: TestDb;
let port: number;
const sockets: WebSocket[] = [];

interface HandshakeOutcome {
  status: number | "open";
  body: string;
}

/** Attempts a handshake and reports how the server answered it. */
function handshake(options: { host?: string; origin?: string } = {}): Promise<HandshakeOutcome> {
  const sessionId = ptyManager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() }).id;
  const url = `ws://127.0.0.1:${String(port)}${PTY_WS_PATH}?${PTY_SESSION_PARAM}=${sessionId}`;
  const ws = new WebSocket(url, {
    ...(options.origin ? { origin: options.origin } : {}),
    ...(options.host ? { headers: { host: options.host } } : {}),
  });
  sockets.push(ws);

  return new Promise<HandshakeOutcome>((resolve, reject) => {
    ws.once("open", () => resolve({ status: "open", body: "" }));
    ws.once("unexpected-response", (_request, response: IncomingMessage) => {
      let body = "";
      response.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    ws.once("error", reject);
  });
}

beforeEach(async () => {
  ptyManager = new PtyManager();
  database = openTestDb();
  app = await createServer({ config: loadConfig({}), db: database.db, ptyManager });
  await app.listen({ port: 0, host: "127.0.0.1" });
  port = (app.server.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await app.close();
  await ptyManager.killAll();
  database.cleanup();
});

describe("the upgrade guard", () => {
  it("completes the handshake for a client with no browser signal", async () => {
    // `ws` sends `Host: 127.0.0.1:<port>` and no `Origin` — the shape of curl.
    expect((await handshake()).status).toBe("open");
  });

  it("completes the handshake for the daemon's own origin", async () => {
    expect((await handshake({ origin: `http://127.0.0.1:${String(port)}` })).status).toBe("open");
  });

  it("refuses a rebound Host with 421 before the handshake", async () => {
    const outcome = await handshake({ host: `evil.example:${String(port)}` });

    expect(outcome.status).toBe(421);
    expect(outcome.body).toContain("127.0.0.1");
  });

  it("refuses a foreign Origin with 403 before the handshake — the cross-site hijack", async () => {
    const outcome = await handshake({ origin: "http://evil.example" });

    expect(outcome.status).toBe(403);
    expect(outcome.body).toContain("evil.example");
  });

  it("judges the port it is listening on, not the configured one", async () => {
    // `listen({ port: 0 })` made the two differ; the honest `Host` carries the
    // real one and has to pass. A guard reading the configuration would refuse
    // every WebSocket test in the suite.
    expect((await handshake({ host: `localhost:${String(port)}` })).status).toBe("open");
  });
});
