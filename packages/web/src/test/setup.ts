import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * What jsdom does not implement and xterm.js insists on.
 *
 * These are stubs, not emulation: nothing here measures anything, so a test can
 * assert what the terminal *received* but never how it looks. Layout-dependent
 * behaviour belongs in the e2e suite, where there is a real browser.
 */
if (typeof window.matchMedia !== "function") {
  // xterm reads it to track device pixel ratio changes.
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// xterm normalises CSS colours by round-tripping them through a 2d context.
// jsdom has no canvas, and its "not implemented" notice is printed on every
// single terminal test — noise that trains people to ignore stderr.
HTMLCanvasElement.prototype.getContext = ((): unknown => ({
  fillStyle: "#000000",
  fillRect: () => {},
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  measureText: () => ({ width: 0 }),
})) as unknown as HTMLCanvasElement["getContext"];

if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// CodeMirror measures where a character landed to draw the caret and the
// selection over it, and jsdom's Range has no `getClientRects` at all — the
// call throws, once per layer, per test that mounts an editor. Same deal as the
// canvas above: an empty list is the honest answer from a DOM with no layout,
// and the editor reads it as "nothing visible", which is true here.
if (typeof Range.prototype.getClientRects !== "function") {
  Range.prototype.getClientRects = (() => []) as unknown as Range["getClientRects"];
}

afterEach(() => {
  cleanup();
});
