/**
 * Decision logic for the quick gate. Pure and importable; the entry point is
 * `run-gate-quick.ts`.
 *
 * Two failure modes to avoid, in opposite directions:
 *
 * 1. `vitest run --changed` with a clean tree — the state right after every
 *    commit — exits 0 having executed nothing. A gate that passes without
 *    running is worse than no gate.
 * 2. `passWithNoTests: false` alone turns every documentation-only commit red.
 *    A gate that cries wolf gets ignored, which kills it just as dead.
 *
 * So: ask git whether any code actually changed. If none did, there is
 * genuinely nothing to run and that is a pass. If code did change, vitest must
 * select and run something, and a selection of zero is a failure. If git cannot
 * answer at all, run everything — "I don't know" must never look like "nothing
 * to do".
 */
import { execFileSync } from "node:child_process";

/**
 * Paths whose changes must be covered by tests.
 *
 * Git pathspecs match recursively, so `*.json` also covers
 * `packages/server/tsconfig.json`. The lockfile and the workspace manifest are
 * in here deliberately: a dependency bump changes runtime behaviour without
 * touching a line of TypeScript, and that is the change most likely to break a
 * test at runtime.
 */
export const CODE_GLOBS = [
  "packages/**",
  "e2e/**",
  "scripts/**",
  "*.json",
  "*.ts",
  "*.yaml",
  "*.yml",
];

export const DEFAULT_BASE = "HEAD^";

export type Decision = { run: "all" } | { run: "none" } | { run: "changed" };

/**
 * @param changed changed code files, or `null` when git could not resolve the
 *                base ref at all.
 */
export function decide(changed: readonly string[] | null): Decision {
  if (changed === null) return { run: "all" };
  if (changed.length === 0) return { run: "none" };
  return { run: "changed" };
}

export function changedCodeFiles(base: string): string[] | null {
  try {
    const output = execFileSync("git", ["diff", "--name-only", base, "--", ...CODE_GLOBS], {
      encoding: "utf8",
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
  switch (decision.run) {
    case "none":
      return `gate:quick — no code changed since ${base}, nothing to run.`;
    case "all":
      return `gate:quick — cannot resolve "${base}", running the full suite.`;
    case "changed":
      return `gate:quick — ${count} code file(s) changed since ${base}.`;
  }
}
