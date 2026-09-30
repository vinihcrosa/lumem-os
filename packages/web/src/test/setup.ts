import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { RELOADED_FOR_KEY } from "../hooks/useVersionReload.js";
import { clearErrors } from "../lib/errorLog.js";
import { resetNavigationForTests } from "../lib/navigation.js";
import { resetComposerDraftsForTests } from "../features/workspace/composer-drafts.js";

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

/*
 * Toda aba de teste já *"recarregou uma vez"* (`038`, Parte 2).
 *
 * Os testes de tela respondem ao `health` com a versão que quiserem (`0.0.0`,
 * `1.2.3`), e nenhuma é a do bundle: sem isto, cada um deles faria o
 * `useVersionReload` chamar o `location.reload` do jsdom — que não implementa
 * navegação e escreve um erro no stderr a cada vez. Com a marca posta, a guarda do
 * hook faz o que faria numa aba que já recarregou e não resolveu. O teste do
 * próprio hook limpa o `sessionStorage` antes de cada caso.
 */
beforeEach(() => {
  globalThis.window?.sessionStorage?.setItem(RELOADED_FOR_KEY, "teste");
});

afterEach(() => {
  cleanup();
  globalThis.window?.sessionStorage?.clear();
  // The error log is a module-level store shared across a file's tests, and the
  // query cache feeds it every intentional failure. Reset it so one test's
  // errors never show up in the next one's topbar.
  globalThis.window?.localStorage?.clear();
  clearErrors();
  // O store de `lib/navigation.ts` é module-level de propósito (T21) — o que o
  // faz chamável de qualquer lugar sem contexto é exatamente o que o faz vazar
  // seleção e chegada de um teste para o próximo, dentro do mesmo arquivo.
  resetNavigationForTests();
  // O mesmo motivo, para o rascunho por projeto do compositor de nova
  // worktree (`033` T20, Q1) — outro estado de módulo, outra fuga entre `it`s.
  resetComposerDraftsForTests();
});
