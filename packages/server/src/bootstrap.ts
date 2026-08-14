import type { FastifyInstance } from "fastify";

import type { ServerConfig } from "./config.js";
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
   * Runs before the HTTP server closes, on shutdown.
   *
   * `app.close()` knows nothing about children the daemon spawned. Once PTYs
   * exist, SIGTERM would close the HTTP server and orphan every shell — this is
   * the seam where `ptyManager.killAll()` goes.
   */
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
  beforeClose,
}: BootstrapOptions): Promise<FastifyInstance> {
  const app = await createServer({ config, logger });

  const target = {
    log: app.log,
    close: async () => {
      // Children first: closing the HTTP server does not touch them, and once
      // the process is gone nothing will.
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
