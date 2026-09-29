/**
 * `pnpm gate:mutation` (T14 of docs/features/024-dev-harness/tasks.md): Stryker,
 * in the background and fenced away from this repository.
 *
 * - **At low priority**, by the same rule as `gate:quick` (`nice -n 15`, see
 *   `backgroundCommand`), with 2 Stryker processes of 1 vitest worker each: a
 *   full run is long, and it has to leave the computer usable.
 * - **`GIT_CEILING_DIRECTORIES`** at the sandbox root: the sandbox lives inside
 *   the checkout, and a mutant of `server/src/git/` that changed a command's
 *   `cwd` made git climb from it to this repository and rewrite its `origin`
 *   (testing.md, armadilhas).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { backgroundCommand } from "./gate-quick.js";

const root = join(import.meta.dirname, "..");
const [command, ...args] = backgroundCommand(["pnpm", "exec", "stryker", "run", "stryker.config.json", ...process.argv.slice(2)], {
  platform: process.platform,
  priority: process.env["LUMEM_TEST_PRIORITY"],
  hasTaskpolicy: existsSync("/usr/sbin/taskpolicy"),
}) as [string, ...string[]];

const result = spawnSync(command, args, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GIT_CEILING_DIRECTORIES: join(root, ".stryker-tmp") },
});
process.exit(result.status ?? 1);
