import type { FastifyInstance } from "fastify";

import type { ServerConfig } from "./config.js";
import { PtyManager } from "./pty/PtyManager.js";
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
  beforeClose,
}: BootstrapOptions): Promise<FastifyInstance> {
  const app = await createServer({ config, ptyManager, logger });

  const target = {
    log: app.log,
    close: async () => {
      // Children first, and before any optional hook that might throw: closing
      // the HTTP server does not touch them, and once the process is gone
      // nothing will — SIGTERM would orphan every shell the daemon spawned.
      await ptyManager.killAll();
      if (beforeClose) await beforeClose();
      await app.close();
    },
  };

  installSignalHandlers(signalSource, createShutdownHandler({ target, exit }));

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
