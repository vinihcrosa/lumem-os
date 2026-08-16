/**
 * Decision logic for the quick gate. Pure and importable; the entry point is
 * `run-gate-quick.ts`.
 *
 * Four failure modes, each one created by fixing the previous:
 *
 * 1. `vitest run --changed` with a clean tree — the state right after every
 *    commit — exits 0 having executed nothing. A gate that passes without
 *    running is worse than no gate.
 * 2. `passWithNoTests: false` alone turns every documentation-only commit red.
 *    A gate that cries wolf gets ignored, which kills it just as dead.
 * 3. Routing dependency and config changes through `--changed` is the same
 *    false red: those files are in no test's module graph, so vitest selects
 *    nothing and the run fails with "No test files found".
 * 4. Classifying by directory prefix rather than by traceability leaks in both
 *    directions: `packages/web/index.html` went red (it is under `packages/**`
 *    but vitest cannot trace it) while `drizzle/0001.sql` went green (it is
 *    under no listed prefix at all).
 * 5. A `.ts` under `e2e/` is a playwright spec, and vitest's projects are
 *    `packages/*` and `scripts`: no e2e file is in any vitest module graph. So
 *    a commit of nothing but e2e routed to `--changed`, selected zero tests and
 *    died red — a whole branch head answering red to the gate the README tells
 *    everyone to run.
 *
 * So the split is by what vitest can actually reason about. TypeScript sources
 * live in the module graph and route to `--changed`. Everything else that is
 * not documentation — a lockfile, a migration, an HTML shell, a stylesheet —
 * runs the full suite, because it can break any test and `--changed` has no way
 * to know which. The e2e suite is its own category, because this gate does not
 * run it and the one thing it must not do is imply otherwise.
 */
import { execFileSync } from "node:child_process";

/**
 * Files vitest can trace through its module graph.
 *
 * Git pathspecs match recursively, so this covers `packages/` and `scripts/`
 * without naming them — one less list to keep in sync. `e2e/` is carved out
 * because it is TypeScript vitest never loads: its projects are `packages/*`
 * and `scripts`, so a spec there is in no module graph and `--changed` selects
 * nothing for it.
 */
export const GRAPH_GLOBS = ["*.ts", "*.tsx", ":(exclude)e2e/**"];

/**
 * The playwright suite, which this gate deliberately does not run.
 *
 * Booting a daemon and a browser is what `gate:full` is for; `gate:quick` is
 * the one that answers in seconds, and making it spawn playwright would break
 * that contract. A category of its own so the answer can be "green, and there
 * is a suite here I did not cover" instead of either a false red or a silent
 * "nothing changed".
 */
export const E2E_GLOBS = ["e2e/*.ts", "e2e/*.tsx"];

/**
 * Everything else that can change behaviour: lockfiles, configs, migrations,
 * assets. Expressed as "all files, except the traceable ones and except
 * documentation" so a new file extension is covered the day it appears rather
 * than the day someone remembers to add it.
 */
export const FULL_SUITE_GLOBS = [
  ".",
  ":(exclude)*.ts",
  ":(exclude)*.tsx",
  ":(exclude)*.md",
  ":(exclude)docs/**",
];

export const DEFAULT_BASE = "HEAD^";

/**
 * The base, in the one spelling vitest cannot misread: the full 40-hex commit.
 *
 * A short SHA made only of digits reaches vitest's CLI as a *number*, and
 * `--changed` quietly falls back to "whatever is uncommitted" instead of
 * diffing against the ref. Measured on this repository, against the root
 * commit: `--changed 1234567` selected 13 test files, `--changed 2a3fff0...`
 * the same commit spelled in full selected 50. `baf9298` works — it has
 * letters. Right after a commit, which is when the gate runs, "uncommitted" is
 * empty and the run dies with "No test files found": red, which is the safe
 * direction, but a false red accusing the suite of a defect in the argument.
 *
 * git resolves anything here — short SHA, tag, `HEAD^` — so the ambiguity dies
 * before vitest ever sees the string. An unresolvable base is returned
 * untouched, because `changedFiles` is what turns it into "run everything", and
 * inventing a commit for it would hide that.
 */
export function resolveBase(base: string, cwd?: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${base}^{commit}`], {
      encoding: "utf8",
      ...(cwd === undefined ? {} : { cwd }),
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return base;
  }
}

export type DecisionReason =
  | "unresolved-base"
  | "untraceable-change"
  | "no-change"
  | "e2e-change"
  | "graph-change";

export interface Decision {
  run: "all" | "none" | "changed";
  reason: DecisionReason;
}

/**
 * @param graph       changed TypeScript files, or `null` if git could not answer
 * @param untraceable changed non-TypeScript, non-doc files, or `null` likewise
 * @param e2e         changed playwright specs and their helpers, or `null` likewise
 */
export function decide(
  graph: readonly string[] | null,
  untraceable: readonly string[] | null,
  e2e: readonly string[] | null,
): Decision {
  // "I don't know" must never be reported as "nothing to do".
  if (graph === null || untraceable === null || e2e === null) {
    return { run: "all", reason: "unresolved-base" };
  }
  if (untraceable.length > 0) return { run: "all", reason: "untraceable-change" };
  if (graph.length > 0) return { run: "changed", reason: "graph-change" };
  // Last, and only when vitest has nothing of its own to run: an e2e change
  // alongside a source change is already covered by the selection above.
  if (e2e.length > 0) return { run: "none", reason: "e2e-change" };
  return { run: "none", reason: "no-change" };
}

/**
 * Files changed since `base`, including ones git does not track yet.
 *
 * `git diff` alone ignores untracked files, which would make every brand new
 * source file invisible to the gate — and a new file is exactly what writing a
 * feature produces.
 */
export function changedFiles(
  globs: readonly string[],
  base: string,
  cwd?: string,
): string[] | null {
  const run = (args: string[]): string[] =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      encoding: "utf8",
      ...(cwd === undefined ? {} : { cwd }),
      // Swallow git's own "fatal: bad revision": we translate it into a
      // decision, and letting it leak makes the gate's output read as if the
      // failure were in the test suite.
      stdio: ["ignore", "pipe", "ignore"],
    })
      // -z plus quotePath=false: NUL-separated and never quoted, so a path with
      // an accent or a newline survives intact instead of coming back as
      // "caf\303\251.ts". Nothing consumes these as paths yet, but the day
      // something does, this is the bug nobody would think to look for.
      .split("\0")
      .filter(Boolean);

  try {
    // -z must precede the `--`, otherwise git reads it as a pathspec.
    const tracked = run(["diff", "--name-only", "-z", base, "--", ...globs]);
    const untracked = run(["ls-files", "--others", "--exclude-standard", "-z", "--", ...globs]);
    // The two sets are disjoint by construction — a staged file stops being
    // "other" — so this is belt and braces, not deduplication that fires.
    return [...new Set([...tracked, ...untracked])];
  } catch {
    return null;
  }
}

export function vitestArgs(decision: Decision, base: string): string[] {
  if (decision.run === "all") return ["exec", "vitest", "run"];
  return ["exec", "vitest", "run", "--changed", base, "--passWithNoTests=false"];
}

export function describeDecision(decision: Decision, base: string, count: number): string {
  switch (decision.reason) {
    case "no-change":
      return `gate:quick — no code changed since ${base}, nothing to run.`;
    case "unresolved-base":
      return `gate:quick — cannot resolve "${base}", running the full suite.`;
    case "untraceable-change":
      return `gate:quick — a dependency, config or asset changed since ${base}, running the full suite.`;
    case "e2e-change":
      return `gate:quick — only the e2e suite changed since ${base}; vitest has nothing to run. Playwright is not in this gate: run \`pnpm gate:full\`.`;
    case "graph-change":
      return `gate:quick — ${count} source file(s) changed since ${base}.`;
  }
}
