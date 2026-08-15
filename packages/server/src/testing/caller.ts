import { loadConfig, type ConfigEnv, type ServerConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import type { Db } from "../db/index.js";
import { PtyManager } from "../pty/PtyManager.js";
import { appRouter } from "../routers/index.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

export interface TestCaller {
  api: ReturnType<typeof createCaller>;
  db: Db;
  ptyManager: PtyManager;
  config: ServerConfig;
  /** Kills every session and deletes the database. Always call it. */
  cleanup(): Promise<void>;
}

/**
 * The whole router, over storage that belongs to this test.
 *
 * Calling procedures through the caller rather than over HTTP keeps the tests
 * about behaviour instead of transport — the transport already has its own
 * tests in `server.test.ts`.
 */
export function createTestCaller(env: ConfigEnv = {}): TestCaller {
  const database: TestDb = openTestDb();
  const ptyManager = new PtyManager();
  const config = loadConfig(env);

  return {
    api: createCaller({ config, db: database.db, ptyManager }),
    db: database.db,
    ptyManager,
    config,
    cleanup: async () => {
      await ptyManager.killAll();
      database.cleanup();
    },
  };
}
