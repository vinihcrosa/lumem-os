import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { HighlighterCore } from "shiki";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { color } from "../styles/tokens.js";
import {
  LineTokenCache,
  shikiConfig,
  shikiHighlighting,
  type ShikiConfig,
} from "./shiki-codemirror.js";
import { loadHighlighter, SHIKI_THEME } from "./shiki.js";

let real: HighlighterCore;
let views: EditorView[] = [];

beforeAll(async () => {
  const highlighter = await loadHighlighter("typescript");
  if (highlighter === null) throw new Error("a gramática de typescript não carregou");
  real = highlighter;
});

afterEach(() => {
  for (const view of views) view.destroy();
  views = [];
});

/**
 * The seam between the editor and the palette, and the one that has to stay
 * cheap.
 *
 * Two properties, and they are the reason this file is vendored code rather
 * than a dependency (see the header of `shiki-codemirror.ts`):
 *
 * 1. a keyword comes out with the exact colour `tokens.ts` names for it — the
 *    day shiki changes `codeToTokens`, or the day *we* do, this is what says so;
 * 2. editing one line costs one line. Measured on this machine, re-tokenizing a
 *    39 KiB file takes 202,7 ms and one warm line takes 0,157 ms, so the
 *    difference between the two is the difference between an editor and a
 *    slideshow. The assertion is on the number of calls, never on a clock.
 */
describe("shiki dentro do CodeMirror", () => {
  it("paints a keyword with the exact colour the token names", () => {
    const view = mount("const a = 1;");

    const painted = [...view.contentDOM.querySelectorAll("span")].find(
      (span) => span.textContent === "const",
    );

    expect(painted, "nenhum span com o texto `const`").toBeDefined();
    expect(painted?.style.color).toBe(asRgb(color["syntax/keyword"]));
  });

  it("leaves the document as plain text when there is no grammar for it", () => {
    // F3.3: an extension nobody wrote a grammar for is an answer, not an error.
    const view = new EditorView({
      state: EditorState.create({
        doc: "const a = 1;",
        extensions: [shikiConfig.of(null), shikiHighlighting()],
      }),
      parent: document.body,
    });
    views.push(view);

    expect(view.contentDOM.textContent).toBe("const a = 1;");
    const coloured = [...view.contentDOM.querySelectorAll("span")].filter(
      (span) => span.style.color !== "",
    );
    expect(coloured).toHaveLength(0);
  });

  it("repaints what was typed", () => {
    const view = mount("let a = 1;");

    view.dispatch({ changes: { from: 0, to: 3, insert: "const" } });

    const painted = [...view.contentDOM.querySelectorAll("span")].find(
      (span) => span.textContent === "const",
    );
    expect(painted?.style.color).toBe(asRgb(color["syntax/keyword"]));
  });

  it("editing the last line costs one line, in a small file and in a big one", () => {
    for (const lines of [60, 3000]) {
      const counted = counting();
      const doc = Text.of(Array.from({ length: lines }, (_, i) => `const a${i} = ${i};`));
      const cache = new LineTokenCache(counted.config);

      cache.ensure(doc, doc.lines);
      expect(cache.tokenizedThrough).toBe(lines);
      expect(counted.calls, "a primeira passada tokeniza o arquivo uma vez").toBe(lines);

      counted.reset();
      cache.invalidateFrom(lines);
      cache.ensure(doc, doc.lines);

      // The number that must not be `lines`. This is the whole point of
      // keeping the grammar state per line instead of re-scanning from line 1.
      expect(counted.calls, `${lines} linhas no documento`).toBe(1);
    }
  });

  it("re-tokenizes from the edited line down, and nothing above it", () => {
    const counted = counting();
    const doc = Text.of(Array.from({ length: 100 }, (_, i) => `const a${i} = ${i};`));
    const cache = new LineTokenCache(counted.config);
    cache.ensure(doc, doc.lines);

    counted.reset();
    cache.invalidateFrom(90);
    cache.ensure(doc, doc.lines);

    expect(counted.calls).toBe(11);
  });

  it("knows line 3 is inside the comment that opened on line 1", () => {
    // Without the grammar state threaded from the line above, each line would
    // be tokenized alone and this one would come out as code.
    const doc = Text.of(["/* aberto", "const a = 1;", "ainda comentário", "*/", "const b = 2;"]);
    const cache = new LineTokenCache(config(real));

    cache.ensure(doc, doc.lines);

    expect(colourOf(cache, 3)).toBe(color["syntax/comment"]);
    // ...and that the state closed again on the way out.
    expect(colourOf(cache, 5)).toBe(color["syntax/keyword"]);
  });

  it("stops calling line 3 a comment once the line that opened it is gone", () => {
    const before = Text.of(["/* aberto", "const a = 1;", "ainda comentário", "*/", "const b = 2;"]);
    const cache = new LineTokenCache(config(real));
    cache.ensure(before, before.lines);

    const after = Text.of(["aberto", "const a = 1;", "ainda comentário", "*/", "const b = 2;"]);
    cache.invalidateFrom(1);
    cache.ensure(after, after.lines);

    expect(colourOf(cache, 3)).not.toBe(color["syntax/comment"]);
  });
});

function config(highlighter: HighlighterCore): ShikiConfig {
  return { highlighter, language: "typescript", theme: SHIKI_THEME };
}

function mount(doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [shikiConfig.of(config(real)), shikiHighlighting()],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

/** A highlighter that answers exactly like the real one and counts the asking. */
function counting(): { config: ShikiConfig; calls: number; reset(): void } {
  const counter = {
    calls: 0,
    reset(): void {
      counter.calls = 0;
    },
    config: {
      language: "typescript",
      theme: SHIKI_THEME,
      highlighter: {
        codeToTokens(code: string, options: unknown) {
          counter.calls += 1;
          return real.codeToTokens(code, options as Parameters<typeof real.codeToTokens>[1]);
        },
      } as unknown as HighlighterCore,
    } satisfies ShikiConfig,
  };
  return counter;
}

/** The colour of the first token on a line that has one. */
function colourOf(cache: LineTokenCache, line: number): string | undefined {
  return cache.lineTokens(line)?.find((token) => token.content.trim() !== "")?.color;
}

/** jsdom normalises an inline colour into `rgb()`; the tokens are hex. */
function asRgb(hex: string): string {
  const channel = (at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}
