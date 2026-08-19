import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AcpTranscriptEntry } from "@lumem/shared";

import { createTranscriptStore, type TranscriptStore } from "./TranscriptStore.js";
import {
  COLD_AFTER_MS,
  sweepTranscripts,
  type TranscriptOwner,
} from "./transcript-maintenance.js";

/**
 * The boot pass over the transcript directory (F5.4, D11).
 *
 * This is the one part of the phase that touches files that already have data in
 * them, so what is worth asserting is what it must *not* do: never a live session,
 * never a conversation the registry still owns, and never give up on the rest
 * because one file is unreadable.
 */

const dirs: string[] = [];
const stores: TranscriptStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = 1_800_000_000_000;

function entry(text: string): AcpTranscriptEntry {
  return { at: 1_000, event: { type: "message", messageId: "m-1", role: "agent", text } };
}

/** A directory with one transcript per session named, each holding one message. */
function withTranscripts(...sessionIds: string[]): { dir: string; store: TranscriptStore } {
  const dir = mkdtempSync(join(tmpdir(), "lumem-sweep-"));
  dirs.push(dir);
  const store = createTranscriptStore({ dir });
  stores.push(store);
  for (const sessionId of sessionIds) store.append(sessionId, entry(`de ${sessionId}`));
  store.close();
  return { dir, store };
}

const exitedAgesAgo = (id: string): TranscriptOwner => ({
  id,
  state: "exited",
  updatedAt: NOW - COLD_AFTER_MS - 1,
});
const exitedYesterday = (id: string): TranscriptOwner => ({
  id,
  state: "exited",
  updatedAt: NOW - 24 * 60 * 60 * 1_000,
});
const stillRunning = (id: string): TranscriptOwner => ({
  id,
  state: "running",
  updatedAt: NOW - COLD_AFTER_MS * 12,
});

describe("archiving what went cold", () => {
  it("compresses a conversation that has been over for more than thirty days", () => {
    const { dir } = withTranscripts("velha");

    const report = sweepTranscripts({ dir, sessions: [exitedAgesAgo("velha")], now: NOW });

    expect(report.compressed).toBe(1);
    expect(existsSync(join(dir, "velha.db.gz"))).toBe(true);
    // The original goes, or the archive saved nothing.
    expect(existsSync(join(dir, "velha.db"))).toBe(false);
  });

  it("leaves a conversation that ended yesterday alone", () => {
    const { dir } = withTranscripts("recente");

    const report = sweepTranscripts({ dir, sessions: [exitedYesterday("recente")], now: NOW });

    expect(report.compressed).toBe(0);
    expect(existsSync(join(dir, "recente.db"))).toBe(true);
  });

  it("never touches a live conversation, however old the row is", () => {
    /*
     * The failure this prevents is not a wasted opportunity, it is a broken session:
     * the file is open for writing, and gzipping it out from under a running agent
     * would end the conversation to save a few megabytes. A session can legitimately
     * be a year old and still be talking.
     */
    const { dir } = withTranscripts("viva");

    const report = sweepTranscripts({ dir, sessions: [stillRunning("viva")], now: NOW });

    expect(report.compressed).toBe(0);
    expect(existsSync(join(dir, "viva.db"))).toBe(true);
  });

  it("does not compress an archive again", () => {
    const { dir } = withTranscripts("velha");
    sweepTranscripts({ dir, sessions: [exitedAgesAgo("velha")], now: NOW });

    const second = sweepTranscripts({ dir, sessions: [exitedAgesAgo("velha")], now: NOW });

    expect(second.compressed).toBe(0);
    expect(readdirSync(dir)).toEqual(["velha.db.gz"]);
  });

  it("actually makes the file smaller", () => {
    // Otherwise the whole decision is ceremony. A transcript is repetitive JSON,
    // which is the case gzip is best at.
    const dir = mkdtempSync(join(tmpdir(), "lumem-sweep-size-"));
    dirs.push(dir);
    const store = createTranscriptStore({ dir });
    for (let index = 0; index < 500; index += 1) {
      store.append("grande", entry(`mensagem número ${index} de uma conversa longa`));
    }
    store.close();
    const before = statSync(join(dir, "grande.db")).size;

    sweepTranscripts({ dir, sessions: [exitedAgesAgo("grande")], now: NOW });

    const after = statSync(join(dir, "grande.db.gz")).size;
    expect(after).toBeLessThan(before / 2);
  });
});

describe("the store reading an archive", () => {
  it("gives back the conversation without the caller knowing", () => {
    const { dir } = withTranscripts("velha");
    sweepTranscripts({ dir, sessions: [exitedAgesAgo("velha")], now: NOW });

    const reopened = createTranscriptStore({ dir });
    stores.push(reopened);

    expect(reopened.read("velha")).toEqual([entry("de velha")]);
  });

  it("does not put the file back on disk merely by reading it", () => {
    // A read that writes is a surprise: a read-only volume, or a purge racing it,
    // would turn "show me the conversation" into a failure.
    const { dir } = withTranscripts("velha");
    sweepTranscripts({ dir, sessions: [exitedAgesAgo("velha")], now: NOW });

    const reopened = createTranscriptStore({ dir });
    stores.push(reopened);
    reopened.read("velha");

    expect(readdirSync(dir)).toEqual(["velha.db.gz"]);
  });

  it("thaws it when something writes, so the write is not lost", () => {
    /*
     * Resuming writes under a new session id (D12), so nothing today appends to an
     * archived conversation. The handle it would write through is a deserialised copy
     * in memory, and a write to that vanishes silently — which is why this is guarded
     * rather than assumed impossible.
     */
    const { dir } = withTranscripts("velha");
    sweepTranscripts({ dir, sessions: [exitedAgesAgo("velha")], now: NOW });

    const reopened = createTranscriptStore({ dir });
    stores.push(reopened);
    reopened.read("velha");
    reopened.append("velha", entry("mais uma"));
    reopened.close();

    const again = createTranscriptStore({ dir });
    stores.push(again);
    expect(again.read("velha")).toEqual([entry("de velha"), entry("mais uma")]);
  });

  it("drops the archive too", () => {
    const { dir } = withTranscripts("velha");
    sweepTranscripts({ dir, sessions: [exitedAgesAgo("velha")], now: NOW });

    const reopened = createTranscriptStore({ dir });
    stores.push(reopened);
    reopened.drop("velha");

    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("deleting what nobody owns", () => {
  it("removes a transcript with no session row", () => {
    // What a purge leaves behind. Nothing else will ever come looking for it.
    const { dir } = withTranscripts("orfa", "viva");

    const report = sweepTranscripts({ dir, sessions: [stillRunning("viva")], now: NOW });

    expect(report.dropped).toBe(1);
    expect(existsSync(join(dir, "orfa.db"))).toBe(false);
    expect(existsSync(join(dir, "viva.db"))).toBe(true);
  });

  it("removes an archived orphan too", () => {
    const { dir } = withTranscripts("orfa");
    sweepTranscripts({ dir, sessions: [exitedAgesAgo("orfa")], now: NOW });

    const report = sweepTranscripts({ dir, sessions: [], now: NOW });

    expect(report.dropped).toBe(1);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("when a file will not cooperate", () => {
  it("keeps going, and counts it", () => {
    const { dir } = withTranscripts("boa", "ruim");
    // Unreadable, so compressing it throws. `chmod` is enough: the pass reads the
    // whole file to gzip it.
    chmodSync(join(dir, "ruim.db"), 0o000);
    const warn = vi.fn();

    const report = sweepTranscripts({
      dir,
      sessions: [exitedAgesAgo("boa"), exitedAgesAgo("ruim")],
      now: NOW,
      log: { info: vi.fn(), warn },
    });

    expect(report.compressed).toBe(1);
    expect(report.failed).toBe(1);
    expect(existsSync(join(dir, "boa.db.gz"))).toBe(true);
    expect(warn).toHaveBeenCalled();
    chmodSync(join(dir, "ruim.db"), 0o600);
  });

  it("ignores a file that is not a transcript", () => {
    const { dir } = withTranscripts("boa");
    writeFileSync(join(dir, "notas.txt"), "nada a ver");

    const report = sweepTranscripts({ dir, sessions: [], now: NOW });

    expect(report.checked).toBe(1);
    expect(existsSync(join(dir, "notas.txt"))).toBe(true);
  });

  it("says nothing about a directory that does not exist yet", () => {
    // A daemon that has never had a conversation.
    const report = sweepTranscripts({
      dir: join(tmpdir(), "lumem-sweep-que-nao-existe"),
      sessions: [],
      now: NOW,
    });

    expect(report).toEqual({ checked: 0, compressed: 0, dropped: 0, failed: 0 });
  });
});
