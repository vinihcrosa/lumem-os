import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase, type Database_, type Db } from "./index.js";

export interface TestDb extends Database_ {
  /** Closes the handle *and* deletes the directory. Safe to call twice. */
  cleanup(): void;
}

/**
 * A migrated database that belongs to exactly one test.
 *
 * A file, not `:memory:`: the daemon runs against a file, WAL behaves
 * differently, and a harness that exercises a different storage mode than
 * production is a harness that misses the bugs worth catching.
 *
 * The directory is unique per call, which is what makes the whole `server`
 * suite parallel-safe — two tests running at once never touch the same bytes.
 */
export function openTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), "lumem-test-db-"));
  const handle = openDatabase({ path: join(dir, "lumem.db") });
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    handle.close();
  };

  return {
    db: handle.db,
    // Kept separate from `cleanup` so this satisfies `Database_` and can be
    // injected wherever the daemon expects a real database.
    close,
    cleanup: () => {
      // Both, always: leaving the handle open keeps the -wal file alive, and
      // leaving the directory behind fills /tmp over a long day of test runs.
      close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** `openTestDb` with the cleanup guaranteed, for tests that need only one database. */
export async function withTestDb<TResult>(body: (db: Db) => Promise<TResult>): Promise<TResult> {
  const { db, cleanup } = openTestDb();
  try {
    return await body(db);
  } finally {
    cleanup();
  }
}
