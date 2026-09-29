import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  backgroundCommand,
  changedFiles,
  decide,
  DEFAULT_BASE,
  describeDecision,
  describeDocs,
  DOCS_GLOBS,
  docsCheckNeeded,
  E2E_GLOBS,
  FIXTURE_GLOBS,
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
const fixtures = changedFiles(FIXTURE_GLOBS, base);
const outside = changedFiles(FULL_SUITE_GLOBS, base);
// A fixture change runs the suite, like any other input the graph cannot trace.
const untraceable = outside === null || fixtures === null ? null : [...outside, ...fixtures];
const e2e = changedFiles(E2E_GLOBS, base);
const decision = decide(graph, untraceable, e2e);

const docs = changedFiles(DOCS_GLOBS, base);
if (docsCheckNeeded(docs)) {
  console.log(describeDocs(docs, requested));
  const checked = spawnSync("pnpm", ["-s", "docs:check"], { stdio: "inherit" });
  if (checked.status !== 0) process.exit(checked.status ?? 1);
}

console.log(describeDecision(decision, requested, graph?.length ?? 0));

if (decision.run === "none") process.exit(0);

const [command, ...args] = backgroundCommand(["pnpm", ...vitestArgs(decision, base)], {
  platform: process.platform,
  priority: process.env["LUMEM_TEST_PRIORITY"],
  hasTaskpolicy: existsSync("/usr/sbin/taskpolicy"),
}) as [string, ...string[]];
if (command !== "pnpm") console.log(`gate:quick — em prioridade baixa (${command}); LUMEM_TEST_PRIORITY=normal devolve a máquina inteira.`);
const result = spawnSync(command, args, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
