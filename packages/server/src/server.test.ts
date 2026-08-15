import { LUMEM_VERSION } from "@lumem/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { openTestDb, type TestDb } from "./db/testing.js";
import { PtyManager } from "./pty/PtyManager.js";
import { createServer } from "./server.js";

let app: FastifyInstance;
let ptyManager: PtyManager;
let database: TestDb;

beforeEach(async () => {
  ptyManager = new PtyManager();
  database = openTestDb();
  app = await createServer({ config: loadConfig(), db: database.db, ptyManager });
});

afterEach(async () => {
  await app.close();
  await ptyManager.killAll();
  database.cleanup();
});

describe("health", () => {
  it("answers over the trpc http endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/trpc/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      result: { data: { ok: true, version: LUMEM_VERSION } },
    });
  });

  it("404s an unknown procedure instead of crashing", async () => {
    const response = await app.inject({ method: "GET", url: "/trpc/nope" });

    expect(response.statusCode).toBe(404);
  });
});
