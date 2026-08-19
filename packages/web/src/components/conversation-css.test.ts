import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The port audit.
 *
 * C8's promise is that the conversation's classes come from the prototype with
 * the same names, and that divergence is a bug rather than a choice. A promise
 * like that is worth exactly as much as the thing that checks it — the first
 * attempt at this port silently dropped `.tc--cancelled`, because the source it
 * was copied from predated the fifth card state. Nothing failed. The card just
 * rendered with no colour on its left edge, in the one state that is hardest to
 * produce on purpose.
 *
 * Reading files rather than rendering: jsdom does not apply stylesheets, so a
 * component test cannot see a missing rule. Comparing the text is what can.
 */

const HERE = join(import.meta.dirname, ".");

function read(...names: string[]): string {
  return names.map((name) => readFileSync(join(HERE, name), "utf8")).join("\n");
}

const stylesheet = readFileSync(join(HERE, "conversation.css"), "utf8");
const components = read(
  "Conversation.tsx",
  "Message.tsx",
  "ToolCard.tsx",
  "PermissionRequest.tsx",
);

/** Selectors this stylesheet defines, at any position in a rule. */
function defined(css: string): Set<string> {
  return new Set(
    [...css.matchAll(/(?:^|[\s,>])\.([a-zA-Z0-9_-]+)/gm)].map((match) => match[1]!),
  );
}

/**
 * Classes the components ask for, including the ones built by interpolation.
 *
 * The template literals are the interesting half: `tc--${call.status}` is exactly
 * where a missing variant hides, because the name never appears literally in
 * either file.
 */
const INTERPOLATED = [
  "tc--pending",
  "tc--running",
  "tc--ok",
  "tc--failed",
  "tc--cancelled",
  "turn--user",
  "turn--agent",
  "verdict--allowed",
  "verdict--denied",
];

function requested(source: string): Set<string> {
  const names = new Set<string>();

  for (const match of source.matchAll(/className=(?:\{`|")([^`"]+)/g)) {
    // Everything inside `${…}` is the expression that *builds* a name, not a
    // name: `turn--${role}` would otherwise report `role` as a missing class.
    // What survives interpolation is covered by INTERPOLATED instead.
    const literalOnly = match[1]!.replace(/\$\{[^}]*\}?/g, " ");

    for (const raw of literalOnly.split(/\s+/)) {
      const name = raw.trim();
      if (name === "" || name.endsWith("--")) continue;
      names.add(name);
    }
  }
  return names;
}

/** Defined elsewhere in the app, and reused here on purpose. */
const BORROWED = new Set([
  // The diff is painted by the right panel's own rules (A4).
  "patch",
  "patch--nowrap",
  "dl",
  "dl--add",
  "dl--del",
  "dl__sig",
  "dl__t",
  "hunk",
  // Shared primitives.
  "glyph",
  "btn",
  "focus-ring",
  "empty",
  "empty__glyph",
  "empty__title",
  "empty__sub",
]);

describe("every class the conversation asks for exists", () => {
  it("covers the literal class names", () => {
    const missing = [...requested(components)]
      .filter((name) => !defined(stylesheet).has(name))
      .filter((name) => !BORROWED.has(name))
      .sort();

    expect(missing).toEqual([]);
  });

  it("covers the ones built by interpolation", () => {
    // Where `.tc--cancelled` went missing: the name is in neither file as text,
    // so only an explicit list finds it.
    const rules = defined(stylesheet);
    expect(INTERPOLATED.filter((name) => !rules.has(name))).toEqual([]);
  });

  it("has a rule for all five card states", () => {
    for (const status of ["pending", "running", "ok", "failed", "cancelled"]) {
      expect(stylesheet).toContain(`.tc--${status}`);
    }
  });
});

describe("the stylesheet stays inside the token system", () => {
  it("uses no literal colour", () => {
    // Every colour is a decision that belongs in the generator, where contrast is
    // verified. A hex here is a decision nobody checked.
    const bodyOnly = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(bodyOnly).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(bodyOnly).not.toMatch(/\b(rgb|hsl|oklch)\(/);
  });

  it("uses no literal size beyond the optical hairlines", () => {
    // 1px and 2px borders are the documented exception the rest of the app takes
    // too. Anything else means a value escaped the scale.
    const bodyOnly = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
    const literals = [...bodyOnly.matchAll(/(\d+)px/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value > 2);

    expect(literals).toEqual([]);
  });

  it("does not redefine a token", () => {
    // The stylesheet consumes tokens; it does not author them. `--tc` is the one
    // local variable, and it holds a token rather than a value.
    const authored = [...stylesheet.matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm)].filter(
      ([, name]) => name !== "--tc" && name !== "--w",
    );

    expect(authored.map(([, name]) => name)).toEqual([]);
  });
});

describe("what it deliberately does not carry", () => {
  it.each(["plan", "usage", "meter", "pill", "slash", "daysep", "overage"])(
    "has no rules for %s, which is phase 4",
    (prefix) => {
      // CSS with no markup is dead CSS. These come with the components that use
      // them (A2, D6) — the alternative is a stylesheet nobody can safely edit
      // because nobody knows which half is live.
      expect(stylesheet).not.toMatch(new RegExp(`^\\.${prefix}[\\s{_-]`, "m"));
    },
  );
});
