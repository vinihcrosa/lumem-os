import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig, type ServerConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { ensureMemoryHome } from "../memory/home.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createServer } from "../server.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * Phase 1 of daemon-auth over the wire (PRD §8, F1 and F2).
 *
 * `app.inject`, and not the caller: the caller is blind to headers, and the
 * three attacks this guards against are nothing but headers. Every existing
 * transport test had to start sending a `Host`, and that is the point — under
 * the guard, `light-my-request`'s default `localhost:80` is a rebound page.
 */

let app: FastifyInstance;
let config: ServerConfig;
let ptyManager: PtyManager;
let database: TestDb;

async function daemon(env: Record<string, string> = {}): Promise<void> {
  const stateDir = tempDir("lumem-guard-");
  await ensureMemoryHome({ stateDir });
  config = loadConfig({ LUMEM_STATE_DIR: stateDir, LUMEM_PORT: "4317", ...env });
  ptyManager = new PtyManager();
  database = openTestDb();
  app = await createServer({ config, db: database.db, ptyManager });
}

beforeEach(async () => {
  await daemon();
});

afterEach(async () => {
  await app.close();
  await ptyManager.killAll();
  database.cleanup();
  cleanupGitFixtures();
});

const OWN = "127.0.0.1:4317";

describe("Host (F1)", () => {
  it("answers 421 to a request addressed to another name — DNS rebinding", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
      headers: { host: "evil.example:4317" },
    });

    expect(response.statusCode).toBe(421);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("127.0.0.1:4317");
    expect(response.body).not.toContain("ok");
  });

  it("accepts the three loopback names on the daemon's port", async () => {
    for (const host of ["127.0.0.1:4317", "localhost:4317", "[::1]:4317"]) {
      const response = await app.inject({ method: "GET", url: "/trpc/health", headers: { host } });

      expect(response.statusCode, host).toBe(200);
    }
  });

  it("refuses the right name on the wrong port — a proxy the daemon does not know about", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
      headers: { host: "127.0.0.1:4999" },
    });

    expect(response.statusCode).toBe(421);
  });

  it("refuses before routing: an unknown path from a bad Host is 421, not 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/nada",
      headers: { host: "evil.example:4317" },
    });

    expect(response.statusCode).toBe(421);
  });

  it("does not have a switch: LUMEM_HOST cannot widen the list past loopback", async () => {
    await app.close();
    await expect(daemon({ LUMEM_HOST: "0.0.0.0" })).rejects.toThrow(/não é loopback/);
    // `daemon` threw before assigning; give afterEach something to close.
    await daemon();
  });
});

describe("Origin and Sec-Fetch-Site (F2)", () => {
  it("refuses a mutation from an origin the daemon does not serve", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: OWN, origin: "http://evil.example" },
      payload: { name: "x" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("evil.example");
  });

  it("accepts a mutation from the daemon's own origin — the served web", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: OWN, origin: "http://127.0.0.1:4317" },
      payload: { name: "x" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("accepts a mutation from the dev server's origin by default, and from LUMEM_WEB_ORIGINS", async () => {
    const dev = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: OWN, origin: "http://127.0.0.1:4318" },
      payload: { name: "dev" },
    });
    expect(dev.statusCode).toBe(200);

    await app.close();
    await daemon({ LUMEM_WEB_ORIGINS: "http://127.0.0.1:5001" });

    const isolated = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: OWN, origin: "http://127.0.0.1:5001" },
      payload: { name: "isolated" },
    });
    expect(isolated.statusCode).toBe(200);

    // Setting the variable replaces the default; it does not add to it.
    const defaultGone = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: OWN, origin: "http://127.0.0.1:4318" },
      payload: { name: "gone" },
    });
    expect(defaultGone.statusCode).toBe(403);
  });

  it("refuses the effectful GET when the browser says it is cross-site — the <img src> case", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?q=como+fazer+commit",
      headers: { host: OWN, "sec-fetch-site": "cross-site" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain("cross-site");
  });

  it("refuses the effectful GET from a foreign Origin too", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?q=como+fazer+commit",
      headers: { host: OWN, origin: "http://evil.example" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("serves the effectful GET with no browser signal — curl, the agent's door", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?q=como+fazer+commit",
      headers: { host: OWN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("não sei");
  });

  it("leaves a harmless GET alone even when cross-site: the browser cannot read it anyway", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
      headers: { host: OWN, "sec-fetch-site": "cross-site" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("accepts a mutation with no browser signal — the e2e's API, and the CLI", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: OWN },
      payload: { name: "api" },
    });

    expect(response.statusCode).toBe(200);
  });
});
