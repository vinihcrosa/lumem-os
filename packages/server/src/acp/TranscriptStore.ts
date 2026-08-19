import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import DatabaseCtor, { type Database } from "better-sqlite3";
import type { FastifyBaseLogger } from "fastify";

import { acpTranscriptEntrySchema, type AcpTranscriptEntry } from "@lumem/shared";

import { DomainError } from "../errors.js";

/**
 * The conversation on disk, one SQLite file per session (F5.4, A6, D10).
 *
 * **Why a file per session and not a table in `lumem.db`.** The registry is small,
 * long-lived and queried across rows; a transcript is large, write-heavy and only
 * ever read for one session at a time. Keeping them apart makes the two operations
 * this data actually needs — purge one conversation, archive an old one — a
 * `rm` and a `gzip` instead of a `DELETE` over a table that grew for a year.
 * A6 measured the volume: ~3,9 GB/year raw at the Vinicius's real usage, and the
 * ACP stream should come in under that, since the adapter does not forward the
 * snapshots and attachments the `.jsonl` carries.
 *
 * **Why not part of the drizzle chain.** These files have one table and no history
 * worth migrating. Putting them in the migration chain would mean a session file
 * from last month has to be walked forward before it can be read, and the failure
 * mode of that is a conversation nobody can open. `CREATE TABLE IF NOT EXISTS` and
 * a forward-compatible read (below) buy the same thing for none of the cost.
 *
 * **Why no WAL.** Every other database in this daemon wants WAL, and this one does
 * not: WAL means three files where D10 promises one, and the point of one file is
 * that compressing and purging are file operations. Writers here are also a single
 * process appending in order, which is the case WAL exists to relax.
 *
 * **Append-only, and it shows.** There is no update and no delete — the only write
 * is an `INSERT`. A transcript that can be edited is not a record of what happened,
 * and the replay-equals-live-stream invariant the conversation model rests on is
 * only true if nothing rewrites history behind it.
 */

export interface TranscriptStore {
  /** Records one event. Creates the session's file the first time. */
  append(sessionId: string, entry: AcpTranscriptEntry): void;
  /** The whole conversation, in the order it was written. Empty if there is none. */
  read(sessionId: string): AcpTranscriptEntry[];
  /** Erases the conversation. For purge, and for a session nobody wants back. */
  drop(sessionId: string): void;
  /**
   * Closes this session's file handle, leaving the file alone.
   *
   * A handle per session held for the life of the daemon is a file descriptor that
   * never comes back; a later read reopens on demand, so releasing costs nothing.
   */
  release(sessionId: string): void;
  /** Releases every open file handle. */
  close(): void;
}

export interface TranscriptStoreOptions {
  /** Directory holding one file per session. Created if missing. */
  dir: string;
  /**
   * Where a row that does not decode is reported.
   *
   * A seam because the alternative is a `console.warn` in a daemon, which is a
   * message nobody reads.
   */
  log?: Pick<FastifyBaseLogger, "warn">;
}

/**
 * A session id has to be a safe filename.
 *
 * Ids are UUIDs from `newId()`, so nothing today can fail this. It is checked
 * because the value reaches `join()`, and the day one arrives from a request body
 * is not the day to find out.
 */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function createTranscriptStore({ dir, log }: TranscriptStoreOptions): TranscriptStore {
  mkdirSync(dir, { recursive: true });

  const open = new Map<string, Database>();

  function fileFor(sessionId: string): string {
    if (!SAFE_ID.test(sessionId)) {
      throw new DomainError("INVALID_ARGUMENT", `id de sessão inválido: ${sessionId}`);
    }
    return join(dir, `${sessionId}.db`);
  }

  function handle(sessionId: string, create: boolean): Database | undefined {
    const cached = open.get(sessionId);
    if (cached) return cached;

    const file = fileFor(sessionId);
    // Reading must not bring a file into existence: an empty transcript and a
    // conversation that was purged should both read as nothing, and neither should
    // leave a file behind for the maintenance pass to find.
    if (!create && !existsSync(file)) return undefined;

    const db = new DatabaseCtor(file);
    db.pragma("synchronous = NORMAL");
    db.exec(
      `CREATE TABLE IF NOT EXISTS transcript (
         seq   INTEGER PRIMARY KEY AUTOINCREMENT,
         at    INTEGER NOT NULL,
         event TEXT    NOT NULL
       )`,
    );
    open.set(sessionId, db);
    return db;
  }

  return {
    append(sessionId, entry) {
      const db = handle(sessionId, true)!;
      db.prepare("INSERT INTO transcript (at, event) VALUES (?, ?)").run(
        entry.at,
        JSON.stringify(entry.event),
      );
    },

    read(sessionId) {
      const db = handle(sessionId, false);
      if (!db) return [];

      // `seq`, not `at`. The timestamp is a display detail and two events emitted
      // in the same millisecond are the normal case — a tool call and its first
      // update — so ordering by the clock would show a result before its call.
      const rows = db
        .prepare("SELECT at, event FROM transcript ORDER BY seq ASC")
        .all() as { at: number; event: string }[];

      const entries: AcpTranscriptEntry[] = [];
      for (const row of rows) {
        const entry = decode(row, log, sessionId);
        if (entry) entries.push(entry);
      }
      return entries;
    },

    drop(sessionId) {
      const file = fileFor(sessionId);
      open.get(sessionId)?.close();
      open.delete(sessionId);
      // The sidecars too. Nothing here opens WAL, but a crash mid-write can leave a
      // rollback journal, and a journal without its database is a file that outlives
      // every reference to it.
      for (const suffix of ["", "-journal", "-wal", "-shm"]) {
        rmSync(`${file}${suffix}`, { force: true });
      }
    },

    release(sessionId) {
      open.get(sessionId)?.close();
      open.delete(sessionId);
    },

    close() {
      for (const db of open.values()) db.close();
      open.clear();
    },
  };
}

/**
 * One row, or nothing.
 *
 * A row that does not decode is skipped rather than thrown, and that asymmetry is
 * deliberate: an event written by an older version of the contract is a small,
 * bounded loss, while refusing to open the file turns it into the loss of the whole
 * conversation. The log is what keeps it from being silent.
 */
function decode(
  row: { at: number; event: string },
  log: Pick<FastifyBaseLogger, "warn"> | undefined,
  sessionId: string,
): AcpTranscriptEntry | null {
  let event: unknown;
  try {
    event = JSON.parse(row.event);
  } catch {
    log?.warn({ sessionId, at: row.at }, "linha de transcrição ilegível, ignorada");
    return null;
  }

  const parsed = acpTranscriptEntrySchema.safeParse({ at: row.at, event });
  if (!parsed.success) {
    log?.warn(
      { sessionId, at: row.at, issue: parsed.error.issues[0]?.message },
      "evento de transcrição fora do contrato, ignorado",
    );
    return null;
  }
  return parsed.data;
}

/**
 * The same store, in memory, for a test whose subject is not the disk.
 *
 * It is also the `AcpManager`'s default, and that is a deliberate trade: making the
 * disk store mandatory would mean threading a directory through every test that
 * merely wants to drive a conversation. The cost is that a production wiring which
 * forgets to pass the real one loses transcripts silently — so `bootstrap` has a
 * test that asserts the file appears on disk, which is the only place that mistake
 * can be made.
 */
export function createMemoryTranscriptStore(): TranscriptStore {
  const sessions = new Map<string, AcpTranscriptEntry[]>();

  return {
    append(sessionId, entry) {
      const entries = sessions.get(sessionId) ?? [];
      entries.push(entry);
      sessions.set(sessionId, entries);
    },
    read(sessionId) {
      return [...(sessions.get(sessionId) ?? [])];
    },
    drop(sessionId) {
      sessions.delete(sessionId);
    },
    release() {
      /* nothing to release */
    },
    close() {
      sessions.clear();
    },
  };
}
