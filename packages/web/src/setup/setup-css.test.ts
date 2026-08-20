import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The port audit, in both directions.
 *
 * The promise of this port is that the classes come from
 * `prototype/lumem-onboarding.css` and `prototype/lumem-ds.css` with the same
 * names, so a divergence is a bug rather than a choice. A promise like that is
 * worth exactly as much as the thing that checks it: the conversation's port
 * silently dropped `.tc--cancelled` and nothing failed — the card just rendered
 * with no colour on its left edge, in the state hardest to produce on purpose.
 *
 * Reading files rather than rendering: jsdom applies no stylesheets, so a
 * component test cannot see a missing rule. Comparing the text can.
 *
 * The component list is a directory listing rather than a hand-kept array. A
 * hand-kept one is a list that stops being complete the day someone adds a
 * screen — which is the day this test would have mattered.
 */

const HERE = join(import.meta.dirname, ".");
const UI = join(HERE, "..", "ui");

const stylesheets = [
  readFileSync(join(HERE, "setup.css"), "utf8"),
  readFileSync(join(UI, "ui.css"), "utf8"),
].join("\n");

const componentFiles = readdirSync(HERE).filter(
  (name) => name.endsWith(".tsx") && !name.includes(".test."),
);

const components = componentFiles
  .map((name) => readFileSync(join(HERE, name), "utf8"))
  .join("\n");

/**
 * Classes a stylesheet defines, chained ones included.
 *
 * Selector text only — everything before each `{`. Scanning the whole file would
 * read `opacity: 0.72` as a class called `72`, and scanning only the start of a
 * selector would miss `.choice.is-on`, which is where the state variants live.
 */
function defined(css: string): Set<string> {
  const names = new Set<string>();
  // Comments first: a comment naming `setup.css` sits in selector position and
  // would be read as a class called `css`.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const rule of withoutComments.split("}")) {
    const selector = rule.split("{")[0] ?? "";
    for (const match of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) names.add(match[1]!);
  }
  return names;
}

/**
 * Classes the components ask for, including the ones built by interpolation.
 *
 * The template literals are the interesting half: `ck--${state}` is exactly where
 * a missing variant hides, because the name never appears literally in either
 * file. What survives interpolation is listed in `INTERPOLATED` instead.
 */
const INTERPOLATED = [
  "ck--ok",
  "ck--warn",
  "ck--fail",
  "ck--running",
  "steps__i--done",
  "steps__i--now",
  "wizard__card--narrow",
  "choices--2",
  "is-on",
];

function requested(source: string): Set<string> {
  const names = new Set<string>();

  for (const match of source.matchAll(/className=(?:\{`|")([^`"]+)/g)) {
    // Everything inside `${…}` builds a name rather than being one.
    const literalOnly = match[1]!.replace(/\$\{[^}]*\}?/g, " ");
    for (const raw of literalOnly.split(/\s+/)) {
      const name = raw.trim();
      if (name === "" || name.endsWith("--")) continue;
      names.add(name);
    }
  }
  return names;
}

/** Painted elsewhere in the app, and reused here on purpose. */
const BORROWED = new Set([
  // Shared primitives, from `ui/ui.css` — asserted separately by `ui.test.tsx`.
  "glyph",
  "glyph--worktree",
  "glyph--agent",
  "glyph--project",
  "glyph--shell",
  "btn",
  "input",
  "field",
  "field__label",
  "field__error",
  "banner",
  "card",
  "dim",
  "pane",
  // The receipt is the `MetaGrid`'s second density; its rules live with it.
  "recap",
  "recap__r",
  "recap__k",
  "recap__v",
]);

describe("every class the setup flow asks for exists", () => {
  const available = defined(stylesheets);

  it("finds the flow's own components", () => {
    // The guard on the guard: an empty directory listing would make every
    // assertion below vacuously true.
    expect(componentFiles.length).toBeGreaterThan(5);
  });

  it("defines every literal class the components use", () => {
    const missing = [...requested(components)]
      .filter((name) => !available.has(name))
      .filter((name) => !BORROWED.has(name));

    expect(missing).toEqual([]);
  });

  it("defines every class the components build by interpolation", () => {
    const missing = INTERPOLATED.filter((name) => !available.has(name));
    expect(missing).toEqual([]);
  });

  it("defines nothing the flow does not use", () => {
    // The other direction, and the one that caught `.mode`: the prototype draws a
    // selector for "padrão das próximas sessões" that this flow does not
    // implement (O14), and porting its CSS would leave paint with no markup.
    const own = defined(readFileSync(join(HERE, "setup.css"), "utf8"));
    const asked = requested(components);

    const orphans = [...own]
      .filter((name) => !asked.has(name))
      // Modifiers and children are reached through their block, and states like
      // `is-on` are set by the primitives in `ui/`.
      .filter((name) => !INTERPOLATED.includes(name))
      .filter((name) => {
        const block = name.split(/__|--/)[0]!;
        return block === name && !asked.has(block);
      });

    expect(orphans).toEqual([]);
  });
});
