export interface ShutdownTarget {
  close(): Promise<void>;
  log: {
    info(obj: object, msg: string): void;
    warn(obj: object, msg: string): void;
    error(obj: object, msg: string): void;
  };
}

export interface ShutdownOptions {
  target: ShutdownTarget;
  exit: (code: number) => void;
  /** Hard deadline. A stuck close must not leave the daemon unkillable by Ctrl-C. */
  forceAfterMs?: number;
}

/**
 * Builds the signal handler for the daemon.
 *
 * Two failure modes drive the shape here:
 *
 * 1. A second signal must not start a second `close()` — fastify throws on a
 *    re-entrant close.
 * 2. A second signal must not be *ignored* either. Once PTYs and websockets
 *    exist, `close()` can hang on active connections, and swallowing Ctrl-C
 *    leaves `kill -9` as the only way out — which is exactly what orphans
 *    child processes.
 *
 * So: first signal drains, second signal bails out immediately, and a timer
 * bails out even if no second signal ever arrives.
 */
export function createShutdownHandler({
  target,
  exit,
  forceAfterMs = 5_000,
}: ShutdownOptions): (signal: string) => Promise<void> {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      target.log.warn({ signal }, "second signal during shutdown, exiting now");
      exit(1);
      return;
    }
    shuttingDown = true;

    target.log.info({ signal }, "shutting down");

    const forceTimer = setTimeout(() => {
      target.log.error({ signal, forceAfterMs }, "shutdown timed out, exiting now");
      exit(1);
    }, forceAfterMs);
    forceTimer.unref?.();

    try {
      await target.close();
      exit(0);
    } catch (error) {
      target.log.error({ err: error }, "shutdown failed");
      exit(1);
    } finally {
      clearTimeout(forceTimer);
    }
  };
}
