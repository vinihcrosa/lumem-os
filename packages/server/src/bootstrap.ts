import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import { reconcileOnBoot } from "./boot/reconcile.js";
import type { ServerConfig } from "./config.js";
import { openDatabase, type Database_ } from "./db/index.js";
import { createEventBus } from "./events.js";
import { AcpManager } from "./acp/AcpManager.js";
import { ensureMemoryHome } from "./memory/home.js";
import { MemoryService } from "./memory/MemoryService.js";
import { PtyManager } from "./pty/PtyManager.js";
import { createTranscriptStore, type TranscriptStore } from "./acp/TranscriptStore.js";
import { createSessionStore } from "./sessions/SessionStore.js";
import { createServer } from "./server.js";
import { createShutdownHandler } from "./shutdown.js";
import { installSignalHandlers, type SignalSource } from "./signals.js";

export interface BootstrapOptions {
  config: ServerConfig;
  /** Injected so tests can assert handlers without arming a real process exit. */
  signalSource?: SignalSource;
  exit?: (code: number) => void;
  logger?: boolean;
  /**
   * Owner of the daemon's PTYs. Created here by default; injected by tests that
   * need to inspect the sessions after shutdown.
   */
  ptyManager?: PtyManager;
  /**
   * Owner of every ACP agent. Same reasoning as `ptyManager`: it outlives the
   * HTTP server, because shutdown has to end the conversations before closing the
   * socket they travel on.
   */
  acpManager?: AcpManager;
  /**
   * Where conversations are kept (F5.4).
   *
   * Opened here from `config.transcriptsDir` unless a test hands one over. Closed on
   * shutdown, with the database, for the same reason: an open SQLite handle at exit
   * leaves a journal beside the file.
   */
  transcripts?: TranscriptStore;
  /**
   * Already-open database. Injected by tests that want a throwaway file;
   * otherwise opened here from `config.databasePath` and closed on shutdown.
   */
  database?: Database_;
  /** Extra shutdown work, run after the children die and before the server closes. */
  beforeClose?: () => Promise<void>;
}

/**
 * Builds the daemon, wires shutdown, and starts listening.
 *
 * This exists as a function rather than top-level statements in main.ts because
 * the signal wiring is the single line that decides whether children get closed
 * on SIGTERM, and top-level statements cannot be tested at all — deleting the
 * call passed every gate.
 */
export async function bootstrap({
  config,
  signalSource = process,
  exit = (code) => process.exit(code),
  logger = true,
  ptyManager = new PtyManager(),
  acpManager,
  transcripts,
  database,
  beforeClose,
}: BootstrapOptions): Promise<FastifyInstance> {
  // Antes do banco, porque o banco mora dentro do state dir e porque o
  // `.gitignore` que exclui o próprio banco do histórico é escrito aqui: abrir
  // o SQLite primeiro criaria o arquivo antes de existir a regra que o ignora.
  const home = await ensureMemoryHome({ stateDir: config.stateDir });

  const owned = database === undefined;
  const openedDatabase = database ?? openDatabase({ path: config.databasePath });
  const ownedTranscripts = transcripts === undefined;
  const openedTranscripts = transcripts ?? createTranscriptStore({ dir: config.transcriptsDir });
  // One bus, shared: the session store emits from the PTY exit callback and
  // the router emits from procedures, and both have to reach the same clients.
  const events = createEventBus();
  // Built here rather than defaulted inside `createServer`, because the store and
  // the server both need the *same* one and shutdown needs it too. The first
  // version of this let `createServer` default it, and the daemon then refused
  // every ACP session with "nenhum AcpManager foi ligado" — the store it was
  // handed had been built without one.
  /*
   * The manager needs a logger and the logger does not exist yet: `app.log` comes
   * from `createServer`, which needs the store, which needs the manager. Rather
   * than reorder that or drop the log, the manager gets a forwarder that resolves
   * `app` when a message actually happens — which is always after boot.
   */
  let bootedApp: FastifyInstance | undefined;
  const acp =
    acpManager ??
    new AcpManager({
      // The `PtyManager` the daemon already owns, so the agent can be given a
      // terminal (F3.2, D7). Without it the capability is never declared and the
      // whole feature is dead in the real daemon while every unit test passes —
      // which is exactly how the e2e found this line missing.
      ptyManager,
      // Without this the manager falls back to its in-memory store and the daemon
      // loses every conversation on exit, while every unit test still passes — the
      // same shape of mistake as the `ptyManager` line above, which is why the proof
      // that this one is wired lives in the e2e that restarts the daemon.
      transcripts: openedTranscripts,
      log: {
        warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
          bootedApp?.log.warn(...args);
        },
      },
    });
  const sessionStore = createSessionStore({
    db: openedDatabase.db,
    ptyManager,
    acpManager: acp,
    events,
  });
  const app = await createServer({
    config,
    db: openedDatabase.db,
    ptyManager,
    acpManager: acp,
    sessionStore,
    events,
    logger,
  });
  bootedApp = app;

  const target = {
    log: app.log,
    close: async () => {
      // Children first, and before any optional hook that might throw: closing
      // the HTTP server does not touch them, and once the process is gone
      // nothing will — SIGTERM would orphan every shell the daemon spawned.
      // Unhook first: killAll is about to end every session, and recording
      // those exits would write "exited" rows the next boot has to redo anyway.
      stopTracking();
      await ptyManager.killAll();
      // Conversations too: an adapter left running is a subprocess with nothing
      // pointing at it, exactly like an orphaned shell.
      await acp.killAll();
      if (beforeClose) await beforeClose();
      await app.close();
      // Last: a handler still finishing a request would otherwise write to a
      // closed handle. Only if we opened it — an injected one is the caller's.
      if (owned) openedDatabase.close();
      if (ownedTranscripts) openedTranscripts.close();
    },
  };

  installSignalHandlers(signalSource, createShutdownHandler({ target, exit }));

  // Records follow processes from here on: a shell that dies on its own has to
  // stop being `running` without anyone polling for it.
  const stopTracking = sessionStore.trackExits(app.log);

  // Before listening, deliberately: a client that connects mid-reconciliation
  // would read states that are about to change under it.
  const reconciled = await reconcileOnBoot({
    db: openedDatabase.db,
    transcriptsDir: config.transcriptsDir,
    log: app.log,
  });
  app.log.info(reconciled, "reconciliação de boot");
  // O índice FTS5 é derivado e nasce fora das migrations: um banco com catálogo
  // e sem índice existe. Reconstruir aqui é o que impede a primeira busca de
  // responder "nada encontrado" para o acervo inteiro, sem erro e sem sinal.
  const { failures, ...index } = await new MemoryService({
    db: openedDatabase.db,
    stateDir: config.stateDir,
    log: app.log,
  }).ensureIndexFresh();
  app.log.info(
    { ...home, stateDir: config.stateDir, index, unreadable: failures.length },
    "memória do workspace",
  );

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    // EADDRINUSE is by far the most common way starting the daemon fails, and
    // a raw node stack buries the one thing worth reading. Log the code, not
    // the whole error object.
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    app.log.error({ port: config.port, host: config.host, code }, `cannot listen: ${code}`);
    exit(1);
    return app;
  }

  app.log.info({ port: config.port, host: config.host }, "lumem daemon listening");
  return app;
}
