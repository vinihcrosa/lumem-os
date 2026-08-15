import { describe, expect, it } from "vitest";

import { color, primitives } from "../styles/tokens.js";
import { xtermTheme } from "./xterm-theme.js";

/**
 * The terminal is the one place in the client where a colour is handed over as
 * a value instead of read from a custom property, because `xterm` paints a
 * canvas and never sees the stylesheet.
 *
 * That makes it the one place where the palette can silently drift from the
 * rest of the app. These pin the wiring, not the shades: change a ramp in
 * `generate-tokens.py` and they still pass; hard-code a hex here and they fail.
 */
describe("xterm theme", () => {
  it("takes its surface and text from the same tokens as the rest of the app", () => {
    expect(xtermTheme.background).toBe(color["bg/inset"]);
    expect(xtermTheme.foreground).toBe(color["text/primary"]);
    expect(xtermTheme.cursor).toBe(color["text/primary"]);
  });

  it("maps the ANSI slots onto the product's own ramps", () => {
    // A program's red and the interface's danger have to be the same red. Two
    // reds side by side read as two different meanings.
    expect(xtermTheme.red).toBe(primitives.danger["500"]);
    expect(xtermTheme.green).toBe(primitives.success["500"]);
    expect(xtermTheme.yellow).toBe(primitives.warning["500"]);
    expect(xtermTheme.blue).toBe(primitives.info["500"]);
    expect(xtermTheme.magenta).toBe(primitives.brand["500"]);
  });

  it("keeps every bright slot lighter than its normal one", () => {
    // "Bright black" is what a TUI dims its chrome with. If it lands darker
    // than plain black the frame of an agent's own interface disappears.
    const pairs: ReadonlyArray<[string | undefined, string | undefined]> = [
      [xtermTheme.black, xtermTheme.brightBlack],
      [xtermTheme.red, xtermTheme.brightRed],
      [xtermTheme.green, xtermTheme.brightGreen],
      [xtermTheme.yellow, xtermTheme.brightYellow],
      [xtermTheme.blue, xtermTheme.brightBlue],
      [xtermTheme.magenta, xtermTheme.brightMagenta],
      [xtermTheme.cyan, xtermTheme.brightCyan],
      [xtermTheme.white, xtermTheme.brightWhite],
    ];

    for (const [normal, bright] of pairs) {
      expect(luminance(normal)).toBeLessThan(luminance(bright));
    }
  });

  it("declares no colour of its own", () => {
    // Every slot has to be traceable to a generated token. A literal here is a
    // colour that no longer moves when the brand does.
    const fromTokens = new Set<string>([
      ...Object.values(color),
      ...Object.values(primitives).flatMap((ramp) => Object.values(ramp)),
    ]);

    const opaque = Object.values(xtermTheme).filter(
      (value): value is string => typeof value === "string" && value.length === 7,
    );

    expect(opaque.length).toBeGreaterThan(0);
    for (const value of opaque) expect(fromTokens).toContain(value);
  });
});

function luminance(hex: string | undefined): number {
  if (hex === undefined) throw new Error("slot da paleta ANSI não definido");
  const channel = (offset: number): number => {
    const raw = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
