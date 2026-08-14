#!/usr/bin/env node
/**
 * The quick gate.
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
 * select and run something, and a selection of zero is a failure.
 */
import { execFileSync, spawnSync } from "node:child_process";

/** Paths whose changes must be covered by tests. */
const CODE_GLOBS = ["packages/**", "e2e/**", "ports.json", "*.json", "*.ts"];

const BASE = process.env["LUMEM_GATE_BASE"] ?? "HEAD^";

function changedFiles() {
  const args = ["diff", "--name-only", BASE, "--", ...CODE_GLOBS];
  try {
    return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    // No BASE commit yet (fresh repo). Treat everything as changed.
    return ["<no-base>"];
  }
}

const changed = changedFiles();

if (changed.length === 0) {
  console.log(`gate:quick — no code changed since ${BASE}, nothing to run.`);
  process.exit(0);
}

console.log(`gate:quick — ${changed.length} code file(s) changed since ${BASE}.`);

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--changed", BASE, "--passWithNoTests=false"],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
