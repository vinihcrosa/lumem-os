import { spawnSync } from "node:child_process";

import {
  changedFiles,
  decide,
  DEFAULT_BASE,
  describeDecision,
  FULL_SUITE_GLOBS,
  GRAPH_GLOBS,
  vitestArgs,
} from "./gate-quick.js";

const base = process.env["LUMEM_GATE_BASE"] ?? DEFAULT_BASE;
const graph = changedFiles(GRAPH_GLOBS, base);
const untraceable = changedFiles(FULL_SUITE_GLOBS, base);
const decision = decide(graph, untraceable);

console.log(describeDecision(decision, base, graph?.length ?? 0));

if (decision.run === "none") process.exit(0);

const result = spawnSync("pnpm", vitestArgs(decision, base), { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
