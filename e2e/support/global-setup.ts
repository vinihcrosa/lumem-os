import { createFixtures } from "./fixtures.js";

/**
 * Runs once, after the daemon is up and before the first spec.
 *
 * Safe here rather than in the config body — unlike the state directory, these
 * fixtures are not something the daemon has open.
 */
export default function globalSetup(): void {
  createFixtures();
}
