import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import type { FastifyBaseLogger } from "fastify";

import { ARCHIVE_SUFFIX } from "./TranscriptStore.js";

/**
 * Keeping the transcript directory honest (F5.4, D11).
 *
 * Two jobs, and they are the two ways this directory goes wrong on its own.
 *
 * **Cold conversations get compressed.** A6 measured ~3,9 GB a year of raw
 * transcript at the real usage, and about a quarter of that gzipped. The unit is the
 * whole file, not the row (D11): a single JSON event is small enough that a gzip
 * header eats the saving, and a per-row scheme would put decompression in the hot
 * read path for every conversation instead of only in the rare one. A session that
 * has been over for a month is read rarely and written never, which is exactly the
 * shape that archives well.
 *
 * **Transcripts with no session get deleted.** A row removed from the registry —
 * a purge, a worktree that was thrown away — leaves its conversation behind, and
 * nothing else would ever come looking for it. This is the only place in the daemon
 * that deletes a transcript on its own, and it does it only when the registry says
 * the conversation belongs to nobody.
 *
 * Runs at boot, before the server accepts a connection, for the same reason the
 * worktree reconciliation does: it is the one moment when nothing holds a file open
 * and no client is reading a state that is about to change underneath it.
 */

/** How long a session has to have been over before its transcript is archived. */
export const COLD_AFTER_MS = 30 * 24 * 60 * 60 * 1_000;

export interface TranscriptOwner {
  id: string;
  state: "running" | "exited";
  /**
   * When the row last changed.
   *
   * For an exited session that is when it exited, because nothing updates the row
   * afterwards. A session that was still `running` when the daemon died has its
   * timestamp moved by the boot that marks it exited, so its transcript stays warm
   * for another thirty days — conservative in the right direction: the pass never
   * archives something sooner than it should.
   */
  updatedAt: number;
}

export interface SweepTranscriptsOptions {
  dir: string;
  /** Every session the registry knows about, whatever its state. */
  sessions: readonly TranscriptOwner[];
  now?: number;
  coldAfterMs?: number;
  log?: Pick<FastifyBaseLogger, "info" | "warn">;
}

export interface TranscriptSweepReport {
  checked: number;
  compressed: number;
  dropped: number;
  failed: number;
}

export function sweepTranscripts({
  dir,
  sessions,
  now = Date.now(),
  coldAfterMs = COLD_AFTER_MS,
  log,
}: SweepTranscriptsOptions): TranscriptSweepReport {
  const report: TranscriptSweepReport = { checked: 0, compressed: 0, dropped: 0, failed: 0 };

  const owners = new Map(sessions.map((session) => [session.id, session]));
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    // No directory yet is the state of a daemon that has never had a conversation,
    // not a failure worth reporting.
    return report;
  }

  for (const name of names) {
    const found = identify(name);
    if (!found) continue;
    report.checked += 1;

    try {
      const owner = owners.get(found.sessionId);

      if (!owner) {
        // What is left of a purge. Nothing will ever come looking for it again.
        remove(dir, found.sessionId);
        report.dropped += 1;
        log?.info({ sessionId: found.sessionId }, "transcrição órfã removida");
        continue;
      }

      if (found.archived) continue;
      // A live conversation is never archived, whatever the row's timestamp says:
      // the file is open for writing, and gzipping it out from under the session
      // would end the conversation to save a few megabytes.
      if (owner.state === "running") continue;
      if (now - owner.updatedAt <= coldAfterMs) continue;

      compress(dir, found.sessionId);
      report.compressed += 1;
    } catch (error) {
      // One unreadable file must not stop the pass from tidying the rest — the same
      // rule the worktree reconciliation follows, for the same reason: a single
      // broken file would otherwise mean a broken boot.
      report.failed += 1;
      log?.warn({ sessionId: found.sessionId, err: error }, "falha ao manter a transcrição");
    }
  }

  return report;
}

// --------------------------------------------------------------------- helpers

/** A transcript file, or nothing. Sidecars and strangers are skipped. */
function identify(name: string): { sessionId: string; archived: boolean } | null {
  if (name.endsWith(`.db${ARCHIVE_SUFFIX}`)) {
    return { sessionId: name.slice(0, -`.db${ARCHIVE_SUFFIX}`.length), archived: true };
  }
  if (name.endsWith(".db")) return { sessionId: name.slice(0, -3), archived: false };
  return null;
}

function compress(dir: string, sessionId: string): void {
  const file = join(dir, `${sessionId}.db`);
  const archive = `${file}${ARCHIVE_SUFFIX}`;

  // Written before the original is removed, so a crash in between leaves both
  // rather than neither. `TranscriptStore` prefers the plain file when both exist,
  // which makes that state the harmless one.
  writeFileSync(archive, gzipSync(readFileSync(file)));
  rmSync(file, { force: true });
}

function remove(dir: string, sessionId: string): void {
  const file = join(dir, `${sessionId}.db`);
  for (const suffix of ["", ARCHIVE_SUFFIX, "-journal", "-wal", "-shm"]) {
    rmSync(`${file}${suffix}`, { force: true });
  }
}
