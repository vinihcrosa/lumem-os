import { homedir } from "node:os";
import { join } from "node:path";

import { DEFAULT_SERVER_PORT } from "@lumem/shared";

export interface ServerConfig {
  /** TCP port the HTTP server binds to. */
  port: number;
  /** Interface the HTTP server binds to. Loopback by default — this is a local daemon. */
  host: string;
  /** Root of all Lumem state on disk. */
  stateDir: string;
  /** SQLite database file. */
  databasePath: string;
  /** Where managed git worktrees are created. */
  worktreesDir: string;
}

/** Only the variables this module reads. Keeps tests from touching process.env. */
export type ConfigEnv = Partial<
  Record<"LUMEM_PORT" | "LUMEM_HOST" | "LUMEM_STATE_DIR" | "LUMEM_DB_PATH", string>
>;

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_SERVER_PORT;

  // parseInt stops at the first invalid character, so "4317abc" and "80.9"
  // would both parse to something plausible-looking. Reject them outright.
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`LUMEM_PORT must be an integer between 0 and 65535, got: ${raw}`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed > 65535) {
    throw new Error(`LUMEM_PORT must be an integer between 0 and 65535, got: ${raw}`);
  }
  return parsed;
}

/**
 * Reads configuration from an environment map.
 *
 * The map is a parameter rather than a direct `process.env` read so tests can
 * pass a literal instead of mutating (and having to restore) global state.
 */
export function loadConfig(env: ConfigEnv = process.env): ServerConfig {
  const stateDir = env.LUMEM_STATE_DIR ?? join(homedir(), ".lumem");
  return {
    port: readPort(env.LUMEM_PORT),
    host: env.LUMEM_HOST ?? "127.0.0.1",
    stateDir,
    databasePath: env.LUMEM_DB_PATH ?? join(stateDir, "lumem.db"),
    worktreesDir: join(stateDir, "worktrees"),
  };
}
