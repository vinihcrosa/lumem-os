import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import DatabaseCtor from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AcpTranscriptEntry } from "@lumem/shared";

import { createTranscriptStore, type TranscriptStore } from "./TranscriptStore.js";

/**
 * The conversation on disk (F5.4, D10).
 *
 * This is the part of phase 5 that comes out *lossy* if it comes out wrong. Every
 * other item here can be retried by the user — reopen the tab, press resume — and
 * this one cannot: an event that was not written is gone the moment the daemon
 * exits, and nothing downstream can tell the difference between a turn that never
 * happened and a turn that was not recorded.
 *
 * So what gets asserted is not "it round-trips". It is the four ways a transcript
 * loses data: order, a missing file treated as an error, one bad row taking the
 * rest of the conversation with it, and two sessions writing over each other.
 */

const dirs: string[] = [];
const stores: TranscriptStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function store(): { store: TranscriptStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "lumem-transcript-"));
  dirs.push(dir);
  const created = createTranscriptStore({ dir });
  stores.push(created);
  return { store: created, dir };
}

function message(text: string, at = 1_000): AcpTranscriptEntry {
  return { at, event: { type: "message", messageId: "m-1", role: "agent", text } };
}

describe("writing and reading back", () => {
  it("gives back what was appended", () => {
    const { store: transcripts } = store();

    transcripts.append("s-1", message("olá"));

    expect(transcripts.read("s-1")).toEqual([message("olá")]);
  });

  it("reads in the order it was written, not the order of the clock", () => {
    /*
     * The `at` of an entry is a display detail; the order is the conversation. A
     * store that sorted by timestamp would reorder two events emitted inside the
     * same millisecond — which is the normal case for a tool call and its update,
     * not an edge one — and the replay would show the result before the call.
     */
    const { store: transcripts } = store();

    transcripts.append("s-1", message("primeira", 5_000));
    transcripts.append("s-1", message("segunda", 5_000));
    transcripts.append("s-1", message("terceira", 1));

    expect(transcripts.read("s-1").map((entry) => entry.event)).toEqual([
      message("primeira").event,
      message("segunda").event,
      message("terceira").event,
    ]);
  });

  it("survives the process that wrote it", () => {
    // The whole promise of the phase: kill the daemon, come back, read the
    // conversation. A store that kept the file handle's contents in memory would
    // pass every other test in this file.
    const { store: first, dir } = store();
    first.append("s-1", message("de ontem"));
    first.close();

    const second = createTranscriptStore({ dir });
    stores.push(second);

    expect(second.read("s-1")).toEqual([message("de ontem")]);
  });

  it("keeps one session out of another's file", () => {
    const { store: transcripts, dir } = store();

    transcripts.append("s-1", message("da primeira"));
    transcripts.append("s-2", message("da segunda"));

    expect(transcripts.read("s-1")).toEqual([message("da primeira")]);
    expect(transcripts.read("s-2")).toEqual([message("da segunda")]);
    // One file per session (D10), which is what makes purge and archival a file
    // operation instead of a query.
    expect(readdirSync(dir).filter((name) => name.endsWith(".db"))).toHaveLength(2);
  });

  it("reads a session that never spoke as empty", () => {
    // The state of a session that was created and closed without a prompt. An
    // error here would make reopening that tab a failure instead of a blank page.
    const { store: transcripts } = store();

    expect(transcripts.read("nunca-falou")).toEqual([]);
  });
});

describe("when a row does not decode", () => {
  it("skips it and keeps the rest of the conversation", () => {
    /*
     * A file written by an earlier version of the event contract. The entry cannot
     * be rendered, and that is a small loss; refusing to open the transcript at all
     * would lose the whole conversation over one line, which is not.
     */
    const { store: transcripts, dir } = store();
    transcripts.append("s-1", message("antes"));
    transcripts.close();

    const raw = new DatabaseCtor(join(dir, "s-1.db"));
    raw.prepare("INSERT INTO transcript (at, event) VALUES (?, ?)").run(
      2_000,
      JSON.stringify({ type: "de-uma-versao-que-nao-existe-mais" }),
    );
    raw.close();

    const warn = vi.fn();
    const reopened = createTranscriptStore({ dir, log: { warn } });
    stores.push(reopened);
    reopened.append("s-1", message("depois", 3_000));

    expect(reopened.read("s-1")).toEqual([message("antes"), message("depois", 3_000)]);
    expect(warn).toHaveBeenCalled();
  });

  it("skips a row that is not JSON at all", () => {
    const { store: transcripts, dir } = store();
    transcripts.append("s-1", message("boa"));
    transcripts.close();

    const raw = new DatabaseCtor(join(dir, "s-1.db"));
    raw.prepare("INSERT INTO transcript (at, event) VALUES (?, ?)").run(2_000, "{nao-e-json");
    raw.close();

    const reopened = createTranscriptStore({ dir, log: { warn: vi.fn() } });
    stores.push(reopened);

    expect(reopened.read("s-1")).toEqual([message("boa")]);
  });
});

describe("dropping", () => {
  it("removes the file, so a purge is a file away", () => {
    const { store: transcripts, dir } = store();
    transcripts.append("s-1", message("some"));

    transcripts.drop("s-1");

    expect(readdirSync(dir).filter((name) => name.startsWith("s-1"))).toEqual([]);
    expect(transcripts.read("s-1")).toEqual([]);
  });

  it("says nothing about a transcript that was never there", () => {
    const { store: transcripts } = store();

    expect(() => transcripts.drop("fantasma")).not.toThrow();
  });
});

describe("the session id is a filename", () => {
  it("refuses one that would escape the directory", () => {
    // Ids come from `newId()` and are UUIDs, so this cannot happen today. It is
    // guarded because the value reaches `join()`, and the day an id comes from a
    // request body is not the day to discover that.
    const { store: transcripts } = store();

    expect(() => transcripts.append("../fora", message("x"))).toThrow(/inválido/);
    expect(() => transcripts.read("a/b")).toThrow(/inválido/);
  });
});

describe("the directory", () => {
  it("is created if it does not exist yet", () => {
    // First boot on a fresh machine.
    const parent = mkdtempSync(join(tmpdir(), "lumem-transcript-parent-"));
    dirs.push(parent);
    const created = createTranscriptStore({ dir: join(parent, "nao", "existe") });
    stores.push(created);

    created.append("s-1", message("primeira de todas"));

    expect(created.read("s-1")).toHaveLength(1);
  });

  it("ignores a file in it that is not a transcript", () => {
    const { dir } = store();
    writeFileSync(join(dir, "notas.txt"), "nada a ver");

    const reopened = createTranscriptStore({ dir });
    stores.push(reopened);

    expect(reopened.read("notas")).toEqual([]);
  });
});
