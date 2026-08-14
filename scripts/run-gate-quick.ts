import { spawnSync } from "node:child_process";

import {
  changedCodeFiles,
  decide,
  DEFAULT_BASE,
  describeDecision,
  vitestArgs,
} from "./gate-quick.js";

const base = process.env["LUMEM_GATE_BASE"] ?? DEFAULT_BASE;
const changed = changedCodeFiles(base);
const decision = decide(changed);

console.log(describeDecision(decision, base, changed?.length ?? 0));

if (decision.run === "none") process.exit(0);

const result = spawnSync("pnpm", vitestArgs(decision, base), { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
