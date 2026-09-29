import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest.config.js";

/**
 * The server suite as the Stryker runner sees it (T14 of the `024-dev-harness`).
 *
 * One worker per Stryker process. Without it, each of Stryker's processes ran
 * vitest with the default of one worker **per core**: 6 × 10 processes on an
 * 11-core machine, each of them spawning git and node on top, and the computer
 * was unusable for the 44 minutes of the run (2026-09-29).
 */
export default mergeConfig(
  base,
  defineConfig({
    test: { maxWorkers: 1, fileParallelism: false },
  }),
);
