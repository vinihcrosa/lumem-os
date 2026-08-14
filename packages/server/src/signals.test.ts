import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { installSignalHandlers, SHUTDOWN_SIGNALS } from "./signals.js";

describe("installSignalHandlers", () => {
  it("handles SIGINT", () => {
    const source = new EventEmitter();
    const shutdown = vi.fn();

    installSignalHandlers(source, shutdown);
    source.emit("SIGINT");

    expect(shutdown).toHaveBeenCalledWith("SIGINT");
  });

  it("handles SIGTERM", () => {
    // turbo dev and the playwright webServer teardown both send SIGTERM.
    // Losing this handler means the daemon dies without closing its children.
    const source = new EventEmitter();
    const shutdown = vi.fn();

    installSignalHandlers(source, shutdown);
    source.emit("SIGTERM");

    expect(shutdown).toHaveBeenCalledWith("SIGTERM");
  });

  it("registers a listener for every declared signal", () => {
    const source = new EventEmitter();

    installSignalHandlers(source, vi.fn());

    for (const signal of SHUTDOWN_SIGNALS) {
      expect(source.listenerCount(signal)).toBe(1);
    }
  });

  it("does not swallow a repeated signal", () => {
    // The re-entrancy decision belongs to the shutdown handler, not here.
    const source = new EventEmitter();
    const shutdown = vi.fn();

    installSignalHandlers(source, shutdown);
    source.emit("SIGINT");
    source.emit("SIGINT");

    expect(shutdown).toHaveBeenCalledTimes(2);
  });
});
