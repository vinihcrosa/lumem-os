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

export function isCommandAvailable(command: string, options: AvailabilityOptions = {}): boolean {
  return resolveCommandPath(command, options) !== null;
}

/**
 * Where the command actually is, or `null`.
 *
 * The same walk `isCommandAvailable` always did, with the answer kept instead of
 * thrown away — the onboarding preflight has to *show* the path, because
 * "encontrado" and "encontrado em /opt/homebrew/bin" are different amounts of
 * help when two versions of a CLI are installed and the wrong one is first.
 */
export function resolveCommandPath(
  command: string,
  { path = process.env["PATH"] }: AvailabilityOptions = {},
): string | null {
  const trimmed = command.trim();
  if (trimmed === "") return null;

  // A path rather than a name is not looked up: `./bin/agent` and `/usr/local/
  // bin/claude` mean exactly where they say.
  if (trimmed.includes("/")) {
    if (!isAbsolute(trimmed)) return null;
    return isExecutable(trimmed) ? trimmed : null;
  }

  if (path === undefined || path === "") return null;

  for (const entry of path.split(delimiter)) {
    if (entry === "") continue;
    const candidate = join(entry, trimmed);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}
