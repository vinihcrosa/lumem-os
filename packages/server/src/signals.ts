/** The signals that must run a graceful shutdown. */
export const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

/** The slice of `process` this module needs. Keeps it testable with a fake. */
export interface SignalSource {
  on(signal: string, listener: () => void): unknown;
}

/**
 * Wires graceful shutdown to the process signals.
 *
 * Extracted from main.ts and tested because dropping a signal here is invisible
 * to every gate: the suite stays green while the daemon starts dying on the
 * node default instead. SIGTERM in particular is what `turbo dev` and the
 * playwright webServer teardown send, and losing it means the daemon exits
 * without closing its children — orphaned PTYs.
 */
export function installSignalHandlers(
  source: SignalSource,
  shutdown: (signal: ShutdownSignal) => void | Promise<void>,
): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    source.on(signal, () => {
      void shutdown(signal);
    });
  }
}
