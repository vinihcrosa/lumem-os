import { rm } from "node:fs/promises";

import { E2E_STATE_DIR } from "../ports.js";

/**
 * Wipes the e2e daemon's state before the suite runs.
 *
 * The state dir is a fixed path, so without this it survives between runs. Once
 * the daemon has a database, the second run inherits the first run's workspaces
 * and worktrees, and a test that creates `pessoal` starts failing on a unique
 * constraint — flaky by history, which is the worst kind of red to diagnose.
 */
export default async function globalSetup(): Promise<void> {
  await rm(E2E_STATE_DIR, { recursive: true, force: true });
}
