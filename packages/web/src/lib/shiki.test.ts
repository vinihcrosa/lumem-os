import { describe, expect, it, vi } from "vitest";

/**
 * The one highlighter, and the tick in which there could be two.
 *
 * `loadHighlighter` is a module-level singleton built behind two awaits, so
 * every caller that arrives before the first one resolves finds `highlighter`
 * still null and builds another. That is not theoretical here: the `ScopePanel`
 * keeps every tab mounted, so N tabs with a file open call this in the same
 * tick — and the loser's grammars are registered on an instance nobody holds,
 * while `loaded` says they are ready. The next file to ask gets an instance
 * without its grammar and `codeToTokens` throws.
 *
 * `shiki/core` is doubled rather than real because the property is about how
 * many times it is called, which the real one cannot be asked.
 */
const core = vi.hoisted(() => ({ created: 0, fail: false }));

vi.mock("shiki/core", () => ({
  createHighlighterCore: async () => {
    core.created += 1;
    // Straddling a tick is the whole point: this is the window a second caller
    // arrives in.
    await Promise.resolve();
    if (core.fail) throw new Error("shiki não carregou");
    return { loadLanguage: () => Promise.resolve() };
  },
}));

vi.mock("shiki/engine/javascript", () => ({ createJavaScriptRegexEngine: () => ({}) }));

/** A module whose singleton has not been built yet, which is the state under test. */
async function freshShiki(): Promise<typeof import("./shiki.js")> {
  vi.resetModules();
  core.created = 0;
  core.fail = false;
  return import("./shiki.js");
}

describe("loadHighlighter", () => {
  it("builds one highlighter however many files open in the same tick", async () => {
    const { loadHighlighter } = await freshShiki();

    const [first, second, third] = await Promise.all([
      loadHighlighter("typescript"),
      loadHighlighter("tsx"),
      loadHighlighter("json"),
    ]);

    expect(first, "o highlighter não carregou").not.toBeNull();
    /*
     * Two assertions because the leak shows up in two ways, and which one
     * depends on the runner rather than on us. Vitest intercepts only the
     * first of three concurrent `import("shiki/core")`, so today the second
     * and third callers reach the *real* module and come back holding
     * something other than the double — which is the identity assertion. The
     * day that is fixed, three creations would be counted instead. Serializing
     * the creation closes both: there is one import and one highlighter.
     */
    expect(core.created).toBe(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("tries again after a load that failed", async () => {
    // A failed first load — offline, or a chunk the daemon did not serve —
    // must not become a session with no colour anywhere.
    const { loadHighlighter } = await freshShiki();
    core.fail = true;

    expect(await loadHighlighter("typescript")).toBeNull();

    core.fail = false;
    expect(await loadHighlighter("typescript")).not.toBeNull();
    expect(core.created).toBe(2);
  });
});
