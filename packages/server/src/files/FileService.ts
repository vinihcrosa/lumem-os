import { createHash, randomUUID } from "node:crypto";
import { chmod, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DomainError } from "../errors.js";
import { resolveForWrite, resolveInsideRoot } from "./path-guard.js";

/**
 * A checkout's files: one directory level, one file read, one file written.
 *
 * Both ceilings live here, named, because they are guesses until a real
 * repository disagrees (right-panel open question Q8). Neither is security —
 * that is `path-guard` — they are survival: `node_modules/.pnpm` has
 * directories with thousands of entries, and a lockfile is megabytes of text
 * nobody wants rendered in a 360px column. The write side reuses the read
 * ceiling for a different reason: without it, writing past the limit is how a
 * file stops being readable.
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

export interface WriteOptions {
  /** Written verbatim: line endings and a missing final newline are the client's (A7). */
  text: string;
  /** The revision the buffer was built on. Compared against the disk, F3.2. */
  baseRevision: string;
}

/**
 * A conflict is an answer, not an exception (D3.1, F3.3).
 *
 * The same argument that made `readFile` return `binary` and `too-large`: the
 * agent writing the same file is a case this feature exists to handle, and a
 * thrown error would reach the client as a failure to retry rather than a
 * choice to offer.
 */
export type WriteResult =
  | { ok: true; revision: string }
  | {
      ok: false;
      reason: "stale";
      /** The disk's, so "sobrescrever" needs no second read (F3.4). */
      revision: string;
      /** The disk's mtime, epoch milliseconds: "o agente escreveu isto há 8 s". */
      changedAt: number;
    };

export interface FileService {
  listDir(root: string, path: string, options?: ListOptions): Promise<DirListing>;
  readFile(root: string, path: string): Promise<FileContent>;
  writeFile(root: string, path: string, options: WriteOptions): Promise<WriteResult>;
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

/**
 * Where the bytes go before they are the file. Same directory, always.
 *
 * `rename` is only atomic within a filesystem, so the system tmpdir is not a
 * slower version of this — it is a different operation, one that fails with
 * EXDEV across devices and, worse, copies through the window this exists to
 * close. A function of its own because §5 of the PRD promotes "same directory"
 * from a detail to a security control, and a rule with a name has a test.
 *
 * Hidden and unique: hidden so a temporary that outlives a crash does not show
 * up in the tree, unique so two writers of the same file do not destroy each
 * other's. `randomUUID` rather than `newId` — this is not an entity, it is a
 * filename nobody ever sees.
 */
export function tempPathFor(target: string): string {
  return join(dirname(target), `.lumem-${randomUUID()}.tmp`);
}

/**
 * The whole content, or the previous content. Never half of either (F5.6).
 *
 * The agent may be reading this file at the exact instant of the write, and
 * §5 adds a second reason: a hard link out of the checkout, or a last component
 * swapped for a symlink after the guard ran, both survive every path rule. In
 * place, those two writes land outside the checkout; through a temporary and a
 * `rename`, the file outside keeps its bytes and all that is lost is the link.
 * So no caller writes in place — not for a small file, not with `appendFile`,
 * not as an optimisation.
 *
 * The rename goes over the *target*, never over the directory entry: over the
 * entry it would turn a symlink into a plain file, silently.
 */
export async function writeAtomically(
  target: string,
  content: Buffer,
  mode: number,
): Promise<void> {
  const temp = tempPathFor(target);
  try {
    // The mode is given at creation *and* set again: `open` subtracts the
    // umask, so a file that was 0o777 would come back 0o755 without the chmod,
    // and a file created 0o666 is world-readable for the length of the write.
    await writeFile(temp, content, { mode });
    await chmod(temp, mode & 0o7777);
    await rename(temp, target);
  } catch (error) {
    // Whatever failed, the temporary is not the user's problem. `force` covers
    // the case where it was never created; the catch covers the rest, because
    // a cleanup that throws would replace the real failure with its own.
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
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

    async writeFile(root, path, { text, baseRevision }) {
      const { relative, target, targetless, exists } = await resolveForWrite(root, path);
      if (target === null) {
        // The refusal E3.1 moved here: the guard hands the entry over so it can
        // be removed, and the caller that writes is the one that knows a write
        // is what it has. `target!` is the single edit that undoes this.
        throw new DomainError(
          "BLOCKED",
          targetless === "outside"
            ? `escrita recusada em ${relative}: o link aponta para fora do checkout`
            : `escrita recusada em ${relative}: o link está pendurado, e nada prova onde a gravação cairia`,
        );
      }
      if (!exists) {
        // Creating is `files.create`, and the difference matters: a write finds
        // no revision to compare, and inventing one would make autosave able to
        // resurrect a file the agent just deleted.
        throw new DomainError("NOT_FOUND", `${relative} não existe no checkout`);
      }

      const buffer = Buffer.from(text, "utf8");
      if (buffer.length > maxBytes) {
        // Bytes, not characters: 32 emoji are 32 characters and 128 bytes.
        // Without this the read ceiling is a suggestion — write the file past
        // it and it stops being readable.
        throw new DomainError(
          "INVALID_ARGUMENT",
          `o texto tem ${buffer.length} bytes e o limite é ${maxBytes}`,
        );
      }

      const info = await stat(target).catch((error: NodeJS.ErrnoException) => {
        // The guard proved this existed a few syscalls ago; losing it in
        // between is the agent deleting the file while the buffer was in the
        // air, and that is an answer the user can act on, not a defect.
        throw new DomainError(
          error.code === "EACCES" || error.code === "EPERM" ? "BLOCKED" : "NOT_FOUND",
          `${relative} não está mais no checkout`,
        );
      });
      if (info.isDirectory()) {
        throw new DomainError("INVALID_ARGUMENT", `${relative} é um diretório`);
      }
      if (info.size > maxBytes) {
        // `readFile` answered `too-large` for this file and handed out no
        // revision, so whatever the client is comparing against is invented.
        // Hashing it to say so would mean reading past the ceiling.
        throw new DomainError(
          "BLOCKED",
          `${relative} tem ${info.size} bytes no disco, acima do limite de ${maxBytes}`,
        );
      }

      let current: Buffer;
      try {
        current = await readFile(target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") {
          throw new DomainError("BLOCKED", `sem permissão de escrita em ${relative}`);
        }
        throw error;
      }

      if (!survivesUtf8(current, current.toString("utf8"))) {
        // The second lock of Q9, on the side that has the bytes. Asked before
        // the revision, because this is a fact about the file rather than about
        // this write: no revision makes those bytes safe to replace.
        throw new DomainError(
          "BLOCKED",
          `escrita recusada em ${relative}: o conteúdo no disco não sobrevive a uma ida e volta em UTF-8, e gravar destruiria bytes`,
        );
      }

      const revision = revisionOf(current);
      if (revision !== baseRevision) {
        // Read and compared here, immediately before the write, because that is
        // the only moment the answer is true — the client comparing at read
        // time would be answering about a disk from before the agent ran.
        return { ok: false, reason: "stale", revision, changedAt: Math.round(info.mtimeMs) };
      }

      try {
        await writeAtomically(target, buffer, info.mode);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") {
          throw new DomainError("BLOCKED", `sem permissão de escrita em ${relative}`);
        }
        throw error;
      }
      return { ok: true, revision: revisionOf(buffer) };
    },
  };
}
