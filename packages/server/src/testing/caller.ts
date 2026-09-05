import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AcpManager } from "../acp/AcpManager.js";
import { loadConfig, type ConfigEnv, type ServerConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import type { Db } from "../db/index.js";
import { createEventBus, type EventBus } from "../events.js";
import { createCloneJobStore } from "../git/CloneJobStore.js";
import { createGitService, type GitService } from "../git/GitService.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createScriptRunner, type ScriptRunner } from "../scripts/ScriptRunner.js";
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
  acpManager: AcpManager;
  sessionStore: SessionStore;
  scripts: ScriptRunner;
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
  /*
   * Um `stateDir` descartável, sempre, mesmo quando o teste não pede.
   *
   * `loadConfig({})` resolve para o `~/.lumem` **de verdade**, e o que corre por
   * cima dele grava: `worktree.create` cria worktree dentro de
   * `~/.lumem/worktrees/<projeto>/`, e as fixtures de git têm nome de tmpdir. O
   * resultado, medido na máquina de quem escreveu isto: **nove diretórios
   * `lumem-git-*`** no estado real, deixados por suítes que já tinham passado.
   *
   * A regra que o resto do arquivo já segue para o banco vale para o diretório:
   * teste que toca o estado do desenvolvedor é teste que uma hora o destrói.
   */
  const stateDir =
    env.LUMEM_STATE_DIR ?? mkdtempSync(join(tmpdir(), "lumem-caller-"));
  const scoped: ConfigEnv = { ...env, LUMEM_STATE_DIR: stateDir };
  const ownedStateDir = env.LUMEM_STATE_DIR === undefined;

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
  const config = loadConfig(scoped);
  const git = createGitService();
  const events = createEventBus();
  const sessionStore = createSessionStore({ db: database.db, ptyManager, events, git });
  // Same wiring the daemon uses: without it a session that ends on its own
  // stays `running` and the removal rules read stale state.
  const stopTracking = sessionStore.trackExits();
  const scripts = createScriptRunner({
    db: database.db,
    sessionStore,
    ptyManager,
    shell: config.shell,
    portRange: config.runPortRange,
    events,
  });

  const ctx: Context = {
    config,
    db: database.db,
    ptyManager,
    acpManager,
    sessionStore,
    scripts,
    git,
    clones: createCloneJobStore(),
    events,
  };

  return {
    api: createCaller(ctx),
    ctx,
    db: database.db,
    ptyManager,
    acpManager,
    sessionStore,
    scripts,
    git,
    events,
    config,
    cleanup: async () => {
      stopTracking();
      await acpManager.killAll();
      await ptyManager.killAll();
      database.cleanup();
      // Só o que este caller criou: um `LUMEM_STATE_DIR` vindo do teste é do teste.
      if (ownedStateDir) rmSync(stateDir, { recursive: true, force: true });
    },
  };
}
