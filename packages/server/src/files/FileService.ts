import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { DomainError } from "../errors.js";
import { resolveInsideRoot } from "./path-guard.js";

/**
 * Reading a checkout: one directory level, or one file.
 *
 * Both ceilings live here, named, because they are guesses until a real
 * repository disagrees (right-panel open question Q8). Neither is security —
 * that is `path-guard` — they are survival: `node_modules/.pnpm` has
 * directories with thousands of entries, and a lockfile is megabytes of text
 * nobody wants rendered in a 360px column.
 */

/** Entries returned per directory before the listing says it truncated. */
export const MAX_ENTRIES_PER_DIR = 2_000;

/** Bytes a file may have and still be read. */
export const MAX_FILE_BYTES = 1024 * 1024;

/** How much of a file is sniffed for a NUL byte before calling it binary. */
export const BINARY_SNIFF_BYTES = 8 * 1024;

export type EntryKind = "dir" | "file" | "other";

export interface DirEntry {
  name: string;
  kind: EntryKind;
  /** Bytes, for files. Null for anything the daemon did not measure. */
  size: number | null;
  /** The entry itself is a link; `kind` describes what it points at. */
  symlink: boolean;
}

export interface DirListing {
  /** Root-relative, normalised. Empty string is the checkout itself. */
  path: string;
  entries: DirEntry[];
  /** Entries the directory really has, even when only some were returned. */
  total: number;
  truncated: boolean;
}

/**
 * Why a file that reads fine still cannot be written back.
 *
 * A reason instead of a boolean because the client paints four refusals with
 * the same grammar — binary, too large, and these two — and a mute `false`
 * would make it invent the sentence.
 *
 * Both verdicts are the server's, F1.4. `inside-git` in particular: the client
 * deriving it from the path would put a second copy of the `.git` rule in the
 * browser, and one that misses the symlink and the case-insensitive spellings
 * `path-guard` already handles. Getting it wrong the other way is worse than
 * it sounds — the file opens editable, the user types, autosave fires, and the
 * refusal arrives after the fact instead of before.
 */
export type ReadOnlyReason = "not-utf8" | "inside-git";

export type FileContent =
  | {
      kind: "text";
      path: string;
      bytes: number;
      lines: number;
      text: string;
      /** The content this text is, for a later write to compare against. */
      revision: string;
      /** Null when the file can be written back. */
      readOnly: ReadOnlyReason | null;
    }
  | { kind: "binary"; path: string; bytes: number }
  | { kind: "too-large"; path: string; bytes: number; limit: number };

export interface ListOptions {
  /** Overrides the default ceiling for this call alone, F2.4. */
  maxEntries?: number;
}

export interface FileService {
  listDir(root: string, path: string, options?: ListOptions): Promise<DirListing>;
  readFile(root: string, path: string): Promise<FileContent>;
}

export interface FileServiceOptions {
  maxEntries?: number;
  maxBytes?: number;
}

/**
 * Directories first, then names.
 *
 * `localeCompare` with `numeric` so `10.ts` follows `9.ts`, and with a base
 * sensitivity so `README` and `readme` do not depend on the machine's locale
 * to land next to each other.
 */
const byName = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function compareEntries(a: DirEntry, b: DirEntry): number {
  const aDir = a.kind === "dir" ? 0 : 1;
  const bDir = b.kind === "dir" ? 0 : 1;
  if (aDir !== bDir) return aDir - bDir;
  const byLocale = byName.compare(a.name, b.name);
  // Ties broken by code unit so the order never depends on the sort's stability.
  return byLocale !== 0 ? byLocale : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function isBinary(buffer: Buffer): boolean {
  // A NUL byte in the first KiBs. Extension would be the cheap answer and the
  // wrong one: `.ts` holds video as often as it holds TypeScript.
  const end = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  return buffer.subarray(0, end).includes(0);
}

/**
 * What a read is based on, and what a write is compared against (Q4).
 *
 * The content, not the `mtime`: on some filesystems the `mtime` has a second of
 * granularity and an agent writes several times a second, and an edit that puts
 * the file back the way it was has to give back the *same* revision. The file
 * is read whole anyway, under the same 1 MiB ceiling, so hashing it costs
 * nothing next to what was already paid.
 */
export function revisionOf(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Whether writing the decoded text back would give the same bytes (Q9).
 *
 * The only question asked is whether saving would destroy content — no encoding
 * detection, no guessing which one it really is. A Latin-1 file with no NUL
 * byte walks past the binary sniff and decodes with replacement characters;
 * autosave writes on its own, so it would put those over the original with
 * nobody having clicked anything.
 */
function survivesUtf8(content: Buffer, text: string): boolean {
  return Buffer.from(text, "utf8").equals(content);
}

function countLines(text: string): number {
  if (text === "") return 0;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lines += 1;
  }
  // A trailing newline ends the last line rather than starting a new one.
  return text.endsWith("\n") ? lines - 1 : lines;
}

export function createFileService({
  maxEntries = MAX_ENTRIES_PER_DIR,
  maxBytes = MAX_FILE_BYTES,
}: FileServiceOptions = {}): FileService {
  return {
    async listDir(root, path, options = {}) {
      const { absolute, relative } = await resolveInsideRoot(root, path);

      const info = await stat(absolute);
      if (!info.isDirectory()) {
        throw new DomainError("INVALID_ARGUMENT", `${relative} não é um diretório`);
      }

      let dirents;
      try {
        dirents = await readdir(absolute, { withFileTypes: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") {
          throw new DomainError("BLOCKED", `sem permissão de leitura em ${relative || "."}`);
        }
        throw error;
      }

      const total = dirents.length;
      // Sliced before stat'ing: the ceiling exists so a directory with ten
      // thousand entries costs ten thousand syscalls at most once.
      const kept = dirents.slice(0, Math.max(1, options.maxEntries ?? maxEntries));

      const entries = await Promise.all(
        kept.map(async (dirent): Promise<DirEntry> => {
          const symlink = dirent.isSymbolicLink();
          if (!symlink) {
            const kind: EntryKind = dirent.isDirectory()
              ? "dir"
              : dirent.isFile()
                ? "file"
                : "other";
            const size =
              kind === "file"
                ? await stat(join(absolute, dirent.name))
                    .then((it) => it.size)
                    .catch(() => null)
                : null;
            return { name: dirent.name, kind, size, symlink: false };
          }

          // For a link, what matters on screen is what it points at — and a
          // broken one is "other" rather than a listing that fails.
          const target = await stat(join(absolute, dirent.name)).catch(() => null);
          return {
            name: dirent.name,
            kind: target === null ? "other" : target.isDirectory() ? "dir" : "file",
            size: target !== null && target.isFile() ? target.size : null,
            symlink: true,
          };
        }),
      );

      entries.sort(compareEntries);
      return { path: relative, entries, total, truncated: total > kept.length };
    },

    async readFile(root, path) {
      const { absolute, relative, insideGit } = await resolveInsideRoot(root, path);

      const info = await stat(absolute);
      if (info.isDirectory()) {
        throw new DomainError("INVALID_ARGUMENT", `${relative} é um diretório`);
      }
      if (info.size > maxBytes) {
        // Not read at all: the point of the ceiling is the bytes never entering
        // the process, not being dropped after they did.
        return { kind: "too-large", path: relative, bytes: info.size, limit: maxBytes };
      }

      let buffer: Buffer;
      try {
        buffer = await readFile(absolute);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") {
          throw new DomainError("BLOCKED", `sem permissão de leitura em ${relative}`);
        }
        throw error;
      }

      if (isBinary(buffer)) return { kind: "binary", path: relative, bytes: buffer.length };

      const text = buffer.toString("utf8");
      // `.git` first: it is a fact about the path, true whatever the bytes are,
      // and a file that is both never comes back as `null`.
      const readOnly: ReadOnlyReason | null = insideGit
        ? "inside-git"
        : survivesUtf8(buffer, text)
          ? null
          : "not-utf8";
      return {
        kind: "text",
        path: relative,
        bytes: buffer.length,
        lines: countLines(text),
        text,
        revision: revisionOf(buffer),
        readOnly,
      };
    },
  };
}
