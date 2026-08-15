import type { ITheme } from "@xterm/xterm";

import { color, primitives } from "../styles/tokens.js";

/**
 * The terminal's palette, built from the same tokens as the rest of the app.
 *
 * `xterm` paints its own canvas and never sees a stylesheet, so this is the one
 * place in the client where a colour has to be handed over as a value rather
 * than read from a custom property. That is why `tokens.ts` is generated beside
 * `tokens.css` — both come from one run of `generate-tokens.py`, so they cannot
 * disagree.
 *
 * The sixteen ANSI slots come off the existing ramps rather than a stock
 * palette. A program's red and the interface's `danger` should be the same red;
 * two reds side by side read as two different meanings.
 *
 * The bright variants are the 300 step and the normal ones 500 — one degree
 * apart on a scale that is perceptually uniform, which is what makes "bright
 * black" legible instead of invisible.
 */
export const xtermTheme: ITheme = {
  background: color["bg/inset"],
  foreground: color["text/primary"],
  cursor: color["text/primary"],
  cursorAccent: color["bg/inset"],
  // A selection the emulator draws over its own text: opaque would hide it.
  selectionBackground: `${color["bg/brand"]}55`,
  selectionInactiveBackground: `${color["bg/active"]}88`,

  black: primitives.neutral["900"],
  red: primitives.danger["500"],
  green: primitives.success["500"],
  yellow: primitives.warning["500"],
  blue: primitives.info["500"],
  magenta: primitives.brand["500"],
  cyan: primitives.info["400"],
  white: primitives.neutral["300"],

  brightBlack: primitives.neutral["600"],
  brightRed: primitives.danger["300"],
  brightGreen: primitives.success["300"],
  brightYellow: primitives.warning["300"],
  brightBlue: primitives.info["300"],
  brightMagenta: primitives.brand["300"],
  brightCyan: primitives.info["200"],
  brightWhite: primitives.neutral["50"],
};

/**
 * The terminal's font stack, for the emulator that cannot read CSS.
 *
 * Not the same stack as `--font-family-mono`, and on purpose. A shell prompt
 * is full of glyphs no text font carries — the branch symbol, the powerline
 * separators — and JetBrains Mono renders them as tofu. Naming the patched
 * fonts first means anyone who already has one installed for their own
 * terminal sees the same prompt here; everyone else falls through to the
 * designed font, exactly as before.
 *
 * The Lumem client cannot ship a patched font: they are large and their
 * licences vary. So this is a best effort, and the boxes are the honest
 * outcome for a machine with none.
 */
export const TERMINAL_FONT_FAMILY = [
  '"JetBrainsMono Nerd Font"',
  '"MesloLGS NF"',
  '"FiraCode Nerd Font"',
  '"Hack Nerd Font"',
  '"JetBrains Mono"',
  "ui-monospace",
  "SFMono-Regular",
  "Menlo",
  "monospace",
].join(", ");

/** Matches `--text-mono-lg`: 13px on a 20px line. */
export const TERMINAL_FONT_SIZE = 13;
export const TERMINAL_LINE_HEIGHT = 20 / 13;
