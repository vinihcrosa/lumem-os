import { homedir } from "node:os";
import { join } from "node:path";

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

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`${name} must be an integer between 0 and 65535, got: ${raw}`);
  }
  return parsed;
}

export function loadConfig(): ServerConfig {
  const stateDir = process.env["LUMEM_STATE_DIR"] ?? join(homedir(), ".lumem");
  return {
    port: envInt("LUMEM_PORT", 4317),
    host: process.env["LUMEM_HOST"] ?? "127.0.0.1",
    stateDir,
    databasePath: process.env["LUMEM_DB_PATH"] ?? join(stateDir, "lumem.db"),
    worktreesDir: join(stateDir, "worktrees"),
  };
}
