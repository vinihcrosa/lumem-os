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

  // The daemon writes from HTTP handlers and from PTY exit callbacks at the
  // same time; WAL is what keeps a reader from blocking them.
  if (path !== ":memory:") sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  if (migrateOnOpen) migrateWithRebuildsAllowed(sqlite, db);

  // SQLite ships with foreign keys OFF. Every ON DELETE RESTRICT in the schema
  // is inert without this line — the PRD's "no cascading deletes" would be
  // enforced by nothing at all. Set *after* migrating, for the reason below.
  sqlite.pragma("foreign_keys = ON");

  return {
    db,
    close: () => sqlite.close(),
  };
}

/**
 * Runs migrations with foreign keys off, then proves nothing broke.
 *
 * SQLite cannot add a `CHECK` to an existing table, so any migration that adds
 * an invariant is a table rebuild: create, copy, drop, rename. Dropping a table
 * some other row still references is a foreign key violation — and the pragma
 * that would allow it has to be set **before** the transaction opens.
 * drizzle-kit emits `PRAGMA foreign_keys=OFF` inside the migration, where
 * SQLite ignores it, and its own migrator is what opens the transaction. So the
 * only place this can live is here.
 *
 * `defer_foreign_keys` is not a substitute, and this is worth writing down
 * because it looks like one: it does work inside a transaction, every statement
 * of the rebuild succeeds under it, and `PRAGMA foreign_key_check` comes back
 * clean — and then COMMIT still fails. The implicit `DELETE FROM` inside
 * `DROP TABLE` raises the deferred-violation counter, and re-inserting the rows
 * into what is by then a *different* table never brings it back down.
 *
 * Turning enforcement off is only safe if something checks afterwards, so
 * `foreign_key_check` runs before the handle is handed out. That is strictly
 * more than was checked before: nothing verified referential integrity after a
 * migration at all.
 */
function migrateWithRebuildsAllowed(sqlite: Database.Database, db: Db): void {
  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    const violations = sqlite.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `a migração deixou ${violations.length} referência(s) órfã(s): ` +
          JSON.stringify(violations.slice(0, 5)),
      );
    }
  } finally {
    // Even if the migration threw: a handle with enforcement off would let the
    // caller write rows the schema forbids, and the failure would surface much
    // later, somewhere else.
    sqlite.pragma("foreign_keys = ON");
  }
}
