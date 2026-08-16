import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// `?raw` and not `readFileSync`: a test that reads a path is invisible to
// `vitest --changed`, so editing the generator or a generated file would not
// re-run the guard that exists to watch them. Imported, they are dependencies.
//
// `tokens.css` is the exception, and it is vitest's: with `css: false` — the
// default, and what every other test here wants — a `.css` import resolves to
// an empty string even through `?raw`. So the content comes off the disk and
// the *dependency* is declared by importing the file for its side effect,
// which is what puts the edge in the module graph that `--changed` walks.
import "./tokens.css";

import generator from "../../scripts/generate-tokens.py?raw";
import paletteJson from "./palette.json?raw";
import tokensTs from "./tokens.ts?raw";
import { color } from "./tokens.js";

const COMMITTED: ReadonlyArray<[string, string]> = [
  ["tokens.css", readFileSync(join(import.meta.dirname, "tokens.css"), "utf8")],
  ["tokens.ts", tokensTs],
  ["palette.json", paletteJson],
];

/**
 * The contrast suite, finally attached to a gate.
 *
 * It has always existed inside `generate-tokens.py`, and until this test
 * nothing invoked it: no npm script, no turbo task, no CI step. A guard that
 * runs nowhere is a guard that does not exist, and E1 claimed this one ran.
 *
 * The property here is stronger than "the script passes": regenerating from the
 * `CONFIG` block has to produce byte-identical files. That catches the contrast
 * regression *and* the hand edit of a generated file, which is the other way
 * the palette drifts — and both files say "nao edite a mao" in the line right
 * above the colours somebody would be tempted to edit.
 *
 * There is no `skip` for a machine without `python3`, on purpose. This test
 * exists because a check that silently does nothing is the defect; one that
 * silently skips is the same defect wearing a hat.
 */
describe("os tokens gerados", () => {
  it("regenerating from CONFIG changes nothing that is committed", () => {
    const dir = mkdtempSync(join(tmpdir(), "lumem-tokens-"));
    try {
      const script = join(dir, "generate-tokens.py");
      writeFileSync(script, generator);
      python([script, "--out", dir]);

      for (const [name, committed] of COMMITTED) {
        const fresh = readFileSync(join(dir, name), "utf8");
        expect(fresh, `${name} não é o que o gerador produz`).toBe(committed);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes every declared contrast pair", () => {
    const dir = mkdtempSync(join(tmpdir(), "lumem-contrast-"));
    try {
      const script = join(dir, "generate-tokens.py");
      writeFileSync(script, generator);
      // `--check` exits 1 on any failing pair or a broken grey ladder, so an
      // approved run is the assertion; the text below only makes it readable.
      const report = python([script, "--check"]);

      expect(report).not.toMatch(/REPROVADO/);
      const approved = /TUDO APROVADO — (\d+) pares de contraste/.exec(report);
      expect(approved, "o gerador não relatou aprovação").not.toBeNull();
      // A floor, not the exact count: adding a pair must not fail this, and
      // deleting pairs to make a failing one go away must.
      expect(Number(approved?.[1])).toBeGreaterThanOrEqual(59);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("declares every editor colour the CodeMirror theme reads by name", () => {
    // `codemirror-setup.ts` reads these out of `tokens.ts`. They are generated,
    // so the guard that they still exist belongs beside the generator.
    for (const name of [
      "editor/cursor",
      "editor/selection",
      "editor/active-line",
      "editor/line-number",
      "editor/line-number-active",
      "editor/readonly",
    ] as const) {
      expect(color[name], `${name} sumiu de tokens.ts`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

function python(args: string[]): string {
  try {
    return execFileSync("python3", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `generate-tokens.py falhou:\n${failure.stdout ?? ""}${failure.stderr ?? ""}${failure.message}`,
    );
  }
}
