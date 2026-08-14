import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createShutdownHandler, type ShutdownTarget } from "./shutdown.js";

function makeTarget(close: () => Promise<void>): ShutdownTarget {
  return {
    close: vi.fn(close),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createShutdownHandler", () => {
  it("closes the target and exits zero", async () => {
    const target = makeTarget(() => Promise.resolve());
    const exit = vi.fn();

    await createShutdownHandler({ target, exit })("SIGINT");

    expect(target.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits non-zero when close rejects", async () => {
    const target = makeTarget(() => Promise.reject(new Error("boom")));
    const exit = vi.fn();

    await createShutdownHandler({ target, exit })("SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
    expect(target.log.error).toHaveBeenCalled();
  });

  it("does not start a second close on a repeated signal", async () => {
    let release!: () => void;
    const target = makeTarget(() => new Promise<void>((resolve) => (release = resolve)));
    const exit = vi.fn();
    const shutdown = createShutdownHandler({ target, exit });

    const first = shutdown("SIGINT");
    await shutdown("SIGINT");

    expect(target.close).toHaveBeenCalledOnce();

    release();
    await first;
  });

  it("exits immediately on a repeated signal instead of ignoring it", async () => {
    let release!: () => void;
    const target = makeTarget(() => new Promise<void>((resolve) => (release = resolve)));
    const exit = vi.fn();
    const shutdown = createShutdownHandler({ target, exit });

    const first = shutdown("SIGINT");
    await shutdown("SIGINT");

    // Without this the daemon is unkillable by Ctrl-C once close() hangs on an
    // attached websocket, and kill -9 is what orphans PTY children.
    expect(exit).toHaveBeenCalledWith(1);

    release();
    await first;
  });

  it("force-exits when close never settles", async () => {
    const target = makeTarget(() => new Promise<void>(() => {}));
    const exit = vi.fn();

    void createShutdownHandler({ target, exit, forceAfterMs: 5_000 })("SIGINT");
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not force-exit after a clean close", async () => {
    const target = makeTarget(() => Promise.resolve());
    const exit = vi.fn();

    await createShutdownHandler({ target, exit, forceAfterMs: 5_000 })("SIGINT");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
