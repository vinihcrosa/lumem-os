import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { schema } from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export interface Database_ {
  db: Db;
  /** Releases the file handle. Nothing else may use `db` afterwards. */
  close(): void;
}

/**
 * Where `drizzle-kit generate` writes migrations.
 *
 * Resolved from this module's own location rather than `process.cwd()`: the
 * daemon is started from wherever the user happens to be.
 */
export const MIGRATIONS_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../drizzle");

export interface OpenDatabaseOptions {
  /** File path, or `:memory:`. */
  path: string;
  /** Off in tests that want to inspect a half-migrated file. */
  migrateOnOpen?: boolean;
}

export function openDatabase({ path, migrateOnOpen = true }: OpenDatabaseOptions): Database_ {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);

  // SQLite ships with foreign keys OFF. Every ON DELETE RESTRICT in the schema
  // is inert without this line — the PRD's "no cascading deletes" would be
  // enforced by nothing at all.
  sqlite.pragma("foreign_keys = ON");
  // The daemon writes from HTTP handlers and from PTY exit callbacks at the
  // same time; WAL is what keeps a reader from blocking them.
  if (path !== ":memory:") sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  if (migrateOnOpen) migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  return {
    db,
    close: () => sqlite.close(),
  };
}
