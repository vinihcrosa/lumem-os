import { AcpManager } from "../acp/AcpManager.js";
import { loadConfig, type ConfigEnv, type ServerConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import type { Db } from "../db/index.js";
import { createEventBus, type EventBus } from "../events.js";
import { createGitService, type GitService } from "../git/GitService.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createSessionStore, type SessionStore } from "../sessions/SessionStore.js";
import { appRouter } from "../routers/index.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

export interface TestCaller {
  api: ReturnType<typeof createCaller>;
  db: Db;
  ptyManager: PtyManager;
  acpManager: AcpManager;
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
export interface TestCallerOverrides {
  /**
   * A manager whose adapter is fake.
   *
   * Only `setup.probe` needs it: it is the one procedure that reaches the manager
   * directly, and without a seam the test would spawn whatever `claude-agent-acp`
   * happens to be on the machine running the suite — which makes the result depend
   * on the laptop.
   */
  acpManager?: AcpManager;
}

export function createTestCaller(
  env: ConfigEnv = {},
  overrides: TestCallerOverrides = {},
): TestCaller {
  const database: TestDb = openTestDb();
  const ptyManager = new PtyManager();
  /*
   * A manager of its own, wired to nothing.
   *
   * The sessions in these tests go through the store, which builds its own; this
   * one exists because `setup.probe` reaches the manager directly (onboarding D4),
   * and a context missing it would fail at the type level for every other router.
   */
  const acpManager = overrides.acpManager ?? new AcpManager();
  const config = loadConfig(env);
  const git = createGitService();
  const events = createEventBus();
  const sessionStore = createSessionStore({ db: database.db, ptyManager, events, git });
  // Same wiring the daemon uses: without it a session that ends on its own
  // stays `running` and the removal rules read stale state.
  const stopTracking = sessionStore.trackExits();

  return {
    api: createCaller({
      config,
      db: database.db,
      ptyManager,
      acpManager,
      sessionStore,
      git,
      events,
    }),
    db: database.db,
    ptyManager,
    acpManager,
    sessionStore,
    git,
    events,
    config,
    cleanup: async () => {
      stopTracking();
      await acpManager.killAll();
      await ptyManager.killAll();
      database.cleanup();
    },
  };
}
