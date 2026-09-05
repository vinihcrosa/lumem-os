import { LUMEM_VERSION } from "@lumem/shared";

import { run } from "./run.js";

/**
 * The entry point of the published binary.
 *
 * It does not exit on success: the daemon is running in this process, and
 * `process.exit` here would kill it the instant it finished starting. The exit
 * code only matters on the paths that never started anything.
 */
const code = await run(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
  version: LUMEM_VERSION,
});

if (code !== 0) process.exit(code);
