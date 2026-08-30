import { loadConfig, type ConfigEnv, type ServerConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import type { Db } from "../db/index.js";
import { createEventBus, type EventBus } from "../events.js";
import { createCloneJobStore } from "../git/CloneJobStore.js";
import { createGitService, type GitService } from "../git/GitService.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createSessionStore, type SessionStore } from "../sessions/SessionStore.js";
import { appRouter } from "../routers/index.js";
import { createCallerFactory, type Context } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

export interface TestCaller {
  api: ReturnType<typeof createCaller>;
  /** The same context the procedures get, for the routines they share. */
  ctx: Context;
  db: Db;
  ptyManager: PtyManager;
  sessionStore: SessionStore;
  git: GitService;
  events: EventBus;
  config: ServerConfig;
  /** Kills every session and deletes the database. Always call it. */
  cleanup(): Promise<void>;
}

/**
 * The whole router, over storage that belongs to this test.
 *
 * Calling procedures through the caller rather than over HTTP keeps the tests
 * about behaviour instead of transport — the transport has its own tests, in
 * `server.test.ts` and in `routers/files.transport.test.ts`.
 */
export function createTestCaller(env: ConfigEnv = {}): TestCaller {
  const database: TestDb = openTestDb();
  const ptyManager = new PtyManager();
  const config = loadConfig(env);
  const git = createGitService();
  const events = createEventBus();
  const sessionStore = createSessionStore({ db: database.db, ptyManager, events });
  // Same wiring the daemon uses: without it a session that ends on its own
  // stays `running` and the removal rules read stale state.
  const stopTracking = sessionStore.trackExits();

  const ctx: Context = {
    config,
    db: database.db,
    ptyManager,
    sessionStore,
    git,
    clones: createCloneJobStore(),
    events,
  };

  return {
    api: createCaller(ctx),
    ctx,
    db: database.db,
    ptyManager,
    sessionStore,
    git,
    events,
    config,
    cleanup: async () => {
      stopTracking();
      await ptyManager.killAll();
      database.cleanup();
    },
  };
}
