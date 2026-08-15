import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PtyConnect } from "../lib/pty-socket.js";

/**
 * The window is no longer the only thing that resizes a terminal.
 *
 * Opening the files column, dragging its edge and splitting the tab to read a
 * file all change this box while the window stands still. When the refit is
 * lost, nothing throws — the agent's output simply wraps at a column that does
 * not exist, which is why this gets a test of its own.
 */
const fit = vi.fn();

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    activate(): void {}
    dispose(): void {}
    fit = fit;
  },
}));

const { Terminal } = await import("./Terminal.js");

const connect: PtyConnect = () => ({ send: () => {}, close: () => {} });

describe("Terminal", () => {
  it("refits when its own box changes", () => {
    const observed: Element[] = [];
    let notify: (() => void) | undefined;
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe(element: Element): void {
        observed.push(element);
      }
      disconnect(): void {}
      unobserve(): void {}
    } as unknown as typeof ResizeObserver;

    try {
      const { getByTestId } = render(<Terminal sessionId="s1" connect={connect} />);
      expect(observed).toEqual([getByTestId("terminal")]);

      fit.mockClear();
      notify?.();

      expect(fit).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
