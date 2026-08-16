import { spawnSync } from "node:child_process";

import {
  changedFiles,
  decide,
  DEFAULT_BASE,
  describeDecision,
  E2E_GLOBS,
  FULL_SUITE_GLOBS,
  GRAPH_GLOBS,
  resolveBase,
  vitestArgs,
} from "./gate-quick.js";

const requested = process.env["LUMEM_GATE_BASE"] ?? DEFAULT_BASE;
// Resolved once, here, so vitest is never handed a ref it can read as a number.
// Messages keep the spelling that was asked for: "cannot resolve HEAD^" is what
// the reader can act on, a 40-hex echo is not.
const base = resolveBase(requested);
const graph = changedFiles(GRAPH_GLOBS, base);
const untraceable = changedFiles(FULL_SUITE_GLOBS, base);
const e2e = changedFiles(E2E_GLOBS, base);
const decision = decide(graph, untraceable, e2e);

console.log(describeDecision(decision, requested, graph?.length ?? 0));

if (decision.run === "none") process.exit(0);

const result = spawnSync("pnpm", vitestArgs(decision, base), { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
