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

export type FileContent =
  | { kind: "text"; path: string; bytes: number; lines: number; text: string }
  | { kind: "binary"; path: string; bytes: number }
  | { kind: "too-large"; path: string; bytes: number; limit: number };

export interface FileService {
  listDir(root: string, path: string): Promise<DirListing>;
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
    async listDir(root, path) {
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
      const kept = dirents.slice(0, maxEntries);

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
      const { absolute, relative } = await resolveInsideRoot(root, path);

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
      return { kind: "text", path: relative, bytes: buffer.length, lines: countLines(text), text };
    },
  };
}
