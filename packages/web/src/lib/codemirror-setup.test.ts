import { describe, expect, it } from "vitest";

import { color, primitives } from "../styles/tokens.js";
import { EDITOR_THEME_SPEC } from "./codemirror-setup.js";

/**
 * The editor is the third place in the client where a colour is handed over as
 * a value instead of read from a custom property — `xterm` was the first,
 * shiki's theme the second. CodeMirror builds its stylesheet from a JS object,
 * so a `.cm-*` rule written in CSS loses to it on specificity, silently.
 *
 * That makes this the third place where the palette can drift on its own.
 * These pin the wiring, not the shades, exactly as `xterm-theme.test.ts` does:
 * change a ramp in `generate-tokens.py` and they still pass; rename a token and
 * `tokens.ts` stops having the key, which fails the build instead of painting
 * `undefined`; write a hex here and the last one fails.
 */
describe("editor theme", () => {
  it("takes the caret, the selection and the active line from the editor tokens", () => {
    expect(EDITOR_THEME_SPEC[".cm-cursor, .cm-dropCursor"].borderLeftColor).toBe(
      color["editor/cursor"],
    );
    expect(EDITOR_THEME_SPEC[".cm-content"].caretColor).toBe(color["editor/cursor"]);
    expect(
      EDITOR_THEME_SPEC[
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection"
      ].backgroundColor,
    ).toBe(color["editor/selection"]);
    expect(EDITOR_THEME_SPEC[".cm-activeLine"].backgroundColor).toBe(color["editor/active-line"]);
    expect(EDITOR_THEME_SPEC[".cm-activeLineGutter"].backgroundColor).toBe(
      color["editor/active-line"],
    );
    expect(EDITOR_THEME_SPEC[".cm-activeLineGutter"].color).toBe(
      color["editor/line-number-active"],
    );
  });

  it("gives the gutter a legible colour, which is what P8 was about", () => {
    // The viewer's gutter was `text/disabled` — 2,96:1 over the well, under
    // even the minimum for a graphical object. A line number is the address
    // read out loud and the one a failing test points at, and squinting at it
    // is not a thing anyone should do.
    expect(EDITOR_THEME_SPEC[".cm-gutters"].color).toBe(color["editor/line-number"]);
    expect(EDITOR_THEME_SPEC[".cm-gutters"].color).not.toBe(color["text/disabled"]);
  });

  it("paints the code over the same well as the terminal", () => {
    expect(EDITOR_THEME_SPEC["&"].backgroundColor).toBe(color["bg/inset"]);
    expect(EDITOR_THEME_SPEC["&"].color).toBe(color["text/code"]);
    expect(EDITOR_THEME_SPEC[".cm-gutters"].backgroundColor).toBe(color["bg/inset"]);
  });

  it("hangs the continuation of a wrapped line under the code it continues", () => {
    // D3.1 leaves wrapping on, and CodeMirror puts the continuation at column
    // 0, where it reads as a line of its own. The negative indent has to match
    // the padding or the first line moves instead of the continuation.
    const line = EDITOR_THEME_SPEC[".cm-line"];
    expect(line.padding).toBe("0 12px");
    expect(line.textIndent).toBe("-12px");
  });

  it("declares no colour of its own", () => {
    // Every colour has to be traceable to a generated token. A literal here is
    // a colour that stops moving when the brand does.
    const fromTokens = new Set<string>([
      ...Object.values(color),
      ...Object.values(primitives).flatMap((ramp) => Object.values(ramp)),
    ]);

    const literals = JSON.stringify(EDITOR_THEME_SPEC).match(/#[0-9a-fA-F]{3,8}/g) ?? [];

    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) expect(fromTokens).toContain(literal);
  });
});
