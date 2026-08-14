/**
 * Decision logic for the quick gate. Pure and importable; the entry point is
 * `run-gate-quick.ts`.
 *
 * Three failure modes, each one created by fixing the previous:
 *
 * 1. `vitest run --changed` with a clean tree — the state right after every
 *    commit — exits 0 having executed nothing. A gate that passes without
 *    running is worse than no gate.
 * 2. `passWithNoTests: false` alone turns every documentation-only commit red.
 *    A gate that cries wolf gets ignored, which kills it just as dead.
 * 3. Routing dependency and config changes through `--changed` is the same
 *    false red: those files are in no test's module graph, so vitest selects
 *    nothing and the run fails with "No test files found". Every `pnpm add`
 *    would go red.
 *
 * Hence two categories of path. Files that live in the module graph route to
 * `--changed`. Files that change behaviour globally — the lockfile, tsconfig,
 * turbo.json — route to the full suite, because a dependency bump can break any
 * test and `--changed` has no way to know that.
 */
import { execFileSync } from "node:child_process";

/**
 * Paths vitest can reason about through its module graph.
 */
export const GRAPH_GLOBS = ["packages/**", "e2e/**", "scripts/**", "*.ts"];

/**
 * Paths that change behaviour without appearing in any module graph.
 *
 * `pnpm-lock.yaml` is the important one: a dependency bump changes runtime
 * behaviour without touching a line of TypeScript, and it is the change most
 * likely to break a test. Git pathspecs match recursively, so `*.json` also
 * covers `packages/server/tsconfig.json`.
 */
export const GLOBAL_GLOBS = ["*.json", "*.yaml", "*.yml"];

export const DEFAULT_BASE = "HEAD^";

export type DecisionReason = "unresolved-base" | "global-change" | "no-change" | "graph-change";

export interface Decision {
  run: "all" | "none" | "changed";
  reason: DecisionReason;
}

/**
 * @param graph  changed files vitest can trace, or `null` if git could not answer
 * @param global changed dependency/config files, or `null` if git could not answer
 */
export function decide(
  graph: readonly string[] | null,
  global: readonly string[] | null,
): Decision {
  // "I don't know" must never be reported as "nothing to do".
  if (graph === null || global === null) return { run: "all", reason: "unresolved-base" };
  if (global.length > 0) return { run: "all", reason: "global-change" };
  if (graph.length === 0) return { run: "none", reason: "no-change" };
  return { run: "changed", reason: "graph-change" };
}

export function changedFiles(
  globs: readonly string[],
  base: string,
  cwd?: string,
): string[] | null {
  try {
    const output = execFileSync("git", ["diff", "--name-only", base, "--", ...globs], {
      encoding: "utf8",
      ...(cwd === undefined ? {} : { cwd }),
      // Swallow git's own "fatal: bad revision": we translate it into a
      // decision, and letting it leak makes the gate's output read as if the
      // failure were in the test suite.
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.split("\n").filter(Boolean);
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
    case "global-change":
      return `gate:quick — dependency or config changed since ${base}, running the full suite.`;
    case "graph-change":
      return `gate:quick — ${count} code file(s) changed since ${base}.`;
  }
}
