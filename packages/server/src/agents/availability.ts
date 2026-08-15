import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

/**
 * Whether a command could actually be launched, PRD F6.5.
 *
 * Asked before offering the button, not after failing: node-pty does not throw
 * for a missing binary — it produces a PTY that exits 1 and writes nothing, so
 * "not installed" and "crashed on startup" look identical to the user.
 */

export interface AvailabilityOptions {
  /** The daemon's own PATH by default; a parameter so tests need not touch it. */
  path?: string | undefined;
}

function isExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function isCommandAvailable(
  command: string,
  { path = process.env["PATH"] }: AvailabilityOptions = {},
): boolean {
  const trimmed = command.trim();
  if (trimmed === "") return false;

  // A path rather than a name is not looked up: `./bin/agent` and `/usr/local/
  // bin/claude` mean exactly where they say.
  if (trimmed.includes("/")) {
    return isAbsolute(trimmed) ? isExecutable(trimmed) : false;
  }

  if (path === undefined || path === "") return false;

  return path
    .split(delimiter)
    .filter((entry) => entry !== "")
    .some((entry) => isExecutable(join(entry, trimmed)));
}
