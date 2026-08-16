import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  constants,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { DomainError } from "../errors.js";
import { execGit } from "../git/exec.js";
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

/**
 * Entries a delete preview walks before it says the numbers are a floor.
 *
 * `node_modules` is visible in the tree and removable from it (Q15), and it
 * holds hundreds of thousands of entries: counting them all to draw a
 * confirmation dialog is how the tab freezes. The same ceiling as a directory
 * listing, for the same reason and with the same honesty — the count that is
 * shown says when it stopped counting.
 */
export const MAX_PREVIEW_ENTRIES = 2_000;

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
 * A reason instead of a boolean because the client paints five refusals with
 * the same grammar — binary, too large, and these three — and a mute `false`
 * would make it invent the sentence.
 *
 * All three verdicts are the server's, F1.4. `inside-git` in particular: the
 * client deriving it from the path would put a second copy of the `.git` rule
 * in the browser, and one that misses the symlink and the case-insensitive
 * spellings `path-guard` already handles. Getting it wrong the other way is
 * worse than it sounds — the file opens editable, the user types, autosave
 * fires, and the refusal arrives after the fact instead of before.
 *
 * `not-writable` is here because of what the atomic write can do and should
 * not: the bytes land on a new inode and the `rename` needs permission on the
 * *directory*, never on the file, so a 0o444 file would be replaced by a
 * daemon that could not have written a byte into it in place. The write is
 * atomic to protect the file, not to get around its permissions.
 */
export type ReadOnlyReason = "not-utf8" | "inside-git" | "not-writable";

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

export interface RemoveOptions {
  /**
   * Required before a directory with anything in it is removed.
   *
   * §5: an `rmdir` that becomes `rm -rf` because a parameter was left out is
   * the accident with no undo. Defaulting to false makes the caller that forgot
   * hear about it before the disk changes, and the refusal carries the count so
   * the second call is made knowing the size.
   */
  recursive?: boolean;
}

/**
 * What the confirmation dialog needs before anything is removed, F5.7.
 *
 * Two shapes because the screen asks two different questions. For one entry:
 * does git have a copy — "`git checkout --` traz de volta" against "nada traz
 * de volta". For a directory: how much is in there and how much of it is gone
 * for good. There is no `tracked` on the directory side because git tracks no
 * directory; the question that has an answer is how many of the files inside
 * it git cannot bring back.
 *
 * A link, a fifo and an ordinary file are the same shape here, and that is not
 * sloppiness: `remove` unlinks all three as one entry, and a preview that
 * described anything else would be describing another operation.
 */
export type DeletePreview =
  | {
      kind: "file";
      path: string;
      /** git has a copy of these bytes — in the index, which is what `checkout --` restores from. */
      tracked: boolean;
    }
  | {
      kind: "dir";
      path: string;
      /** Files under it, recursively. The directory itself is not one of them. */
      files: number;
      /** Subdirectories under it, recursively. A link to one is a file, not one of these. */
      dirs: number;
      /** Of those files, how many git has no copy of. Nothing brings these back. */
      untracked: number;
      /**
       * The walk stopped early: at the ceiling, or at a subdirectory it could
       * not list. Every count above is then a floor rather than a total, and
       * the dialog has to say so instead of stating a number that is wrong.
       */
      truncated: boolean;
    };

export interface FileService {
  listDir(root: string, path: string, options?: ListOptions): Promise<DirListing>;
  readFile(root: string, path: string): Promise<FileContent>;
  writeFile(root: string, path: string, options: WriteOptions): Promise<WriteResult>;
  /** An empty file, F5.3. The name has to be free, and that is decided atomically. */
  createFile(root: string, path: string): Promise<{ path: string }>;
  createDir(root: string, path: string): Promise<{ path: string }>;
  /** Renaming is moving, F4.2: both ends go through the guard, and the destination has to be free. */
  rename(root: string, from: string, to: string): Promise<{ path: string }>;
  remove(root: string, path: string, options?: RemoveOptions): Promise<void>;
  /** What the confirmation needs to know before it asks, F5.7. Reads only. */
  deletePreview(root: string, path: string): Promise<DeletePreview>;
}

export interface FileServiceOptions {
  maxEntries?: number;
  maxBytes?: number;
  maxPreviewEntries?: number;
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
 * Whether this process could have written the file where it stands.
 *
 * `access` and not the mode bits, because the honest question is "este
 * processo consegue escrever neste arquivo?" and the kernel answers it for
 * owner, group, others and ACL at once. Reading `mode & 0o200` would be a
 * second implementation of that decision, right for the ordinary case and
 * wrong for a file owned by a group the daemon is in.
 */
async function isWritable(file: string): Promise<boolean> {
  return access(file, constants.W_OK).then(
    () => true,
    () => false,
  );
}

/**
 * The one order the five refusals are decided in, F1.4.
 *
 * From the most structural to the most dependent on content: the path outranks
 * the permission, which outranks the bytes. A file inside `.git`, read-only and
 * in Latin-1 reports `inside-git` — the reason the person can act on, and the
 * one that stays true whatever the other two say.
 */
async function readOnlyReasonFor(
  file: string,
  content: Buffer,
  text: string,
  insideGit: boolean,
): Promise<ReadOnlyReason | null> {
  if (insideGit) return "inside-git";
  if (!(await isWritable(file))) return "not-writable";
  return survivesUtf8(content, text) ? null : "not-utf8";
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
 * Hidden and unique: unique so two writers of the same file do not destroy
 * each other's, hidden so an orphan left by a crash stays out of a `rm *.ts`
 * and out of the eye. It does *not* hide from the tree — nothing does, that is
 * `FileTree`'s stated rule — which is why `.gitignore` carries `.lumem-*.tmp`:
 * an orphan showing up as untracked in the `Mudanças` tab is the real cost.
 * `randomUUID` rather than `newId` — this is not an entity, it is a filename
 * nobody ever sees.
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
 *
 * And `rename(2)` replaces whatever is on the target, without a word. This
 * function is therefore no help to a caller that needs the name to be *free* —
 * E5's `createFile` answers DUPLICATE, and the `exists` the guard hands back
 * cannot carry that: between the check and the rename there is a window an
 * agent creating the same name fits in. Exclusivity is `open` with `wx`
 * (`O_EXCL`), which is one syscall and has no window. Do not build creation on
 * top of this.
 */
export async function writeAtomically(
  target: string,
  content: Buffer,
  mode: number,
): Promise<void> {
  const temp = tempPathFor(target);
  try {
    // Born 0o600 and only then raised to the target's mode, which is two
    // separate decisions.
    //
    // The birth mode is about the *window*: for the length of the write this
    // file exists under a name nobody expects, and creating it as the target's
    // mode makes it group- or world-readable for that stretch — a private file
    // being edited is briefly readable by everyone the target's mode allows,
    // which is nobody's intent and costs one constant to avoid. No test can pin
    // it: the observer would have to be inside this function. This sentence is
    // the defence, and E5's `Done when` is where the decision was taken, out of
    // a mutation that survived Lote 3 — the final mode is proven, the window
    // was not, and narrowing it is cheaper than testing it.
    //
    // The chmod is about the *result*, and it is the only half that shows on
    // the target: `open` subtracts the umask, so even `{ mode }` at creation
    // would not give back 0o664. Before the rename, never after — that is what
    // makes the file complete *and* correct the instant it appears.
    //
    // Masked to 0o777, so setuid, setgid and the sticky bit are deliberately
    // *not* carried over. These bytes are a new inode created by the daemon's
    // user; setuid on the old inode meant "runs as whoever owned that file",
    // and reproducing it here would hand a privilege the original only had by
    // being someone else's. A text editor has no business minting that.
    await writeFile(temp, content, { mode: 0o600 });
    await chmod(temp, mode & 0o777);
    await rename(temp, target);
  } catch (error) {
    // Whatever failed, the temporary is not the user's problem. `force` covers
    // the case where it was never created; the catch covers the rest, because
    // a cleanup that throws would replace the real failure with its own.
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * What a failed creation means, for a path the guard had already approved.
 *
 * Everything in here runs *after* `resolveForWrite` said yes, and the disk
 * moves in between: the agent takes the name, the parent is removed, a
 * permission changes. None of that is a defect, and all of it arrives as a raw
 * errno that would leave this module as a bare `Error` — which the repository
 * treats as a bug rather than as an answer.
 *
 * ENOENT is P11's other half: a parent that vanishes between the guard's
 * `realpath` and its `lstat` comes back as `exists: false`, with nothing wrong
 * on the way, and this is the syscall that finds out. Assuming the directory is
 * there because the guard just looked is exactly the assumption that breaks.
 *
 * The original error is handed back untouched for a code nobody mapped, so a
 * failing disk stays a defect instead of becoming a sentence the client is told
 * to act on.
 */
export function asCreationFailure(error: unknown, relative: string): unknown {
  const code = (error as NodeJS.ErrnoException).code;
  const parent = dirname(relative) === "." ? "." : dirname(relative);
  if (code === "EEXIST") {
    return new DomainError("DUPLICATE", `já existe alguma coisa em ${relative}`);
  }
  if (code === "ENOENT") {
    return new DomainError("NOT_FOUND", `o diretório ${parent} não existe no checkout`);
  }
  if (code === "ENOTDIR") {
    return new DomainError("INVALID_ARGUMENT", `${parent} não é um diretório`);
  }
  if (code === "EACCES" || code === "EPERM") {
    return new DomainError("BLOCKED", `sem permissão de escrita em ${parent}`);
  }
  return error;
}

/** The same contract as `asCreationFailure`, for the errnos a `rename` has. */
function asRenameFailure(error: unknown, from: string, to: string): unknown {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EEXIST" || code === "ENOTEMPTY") {
    // Taken between the check and the syscall — the window §5 accepts, and the
    // one answer that keeps it from being a silent replace.
    return new DomainError("DUPLICATE", `já existe alguma coisa em ${to}`);
  }
  if (code === "ENOENT") {
    return new DomainError("NOT_FOUND", `${from} ou o diretório de ${to} não está mais no checkout`);
  }
  if (code === "EINVAL") {
    // Moving a directory into its own subtree. Reachable by typing a path in
    // the tree's rename field, which is what F4.2 asks for.
    return new DomainError("INVALID_ARGUMENT", `não dá para mover ${from} para dentro dele mesmo`);
  }
  if (code === "EISDIR" || code === "ENOTDIR") {
    return new DomainError("INVALID_ARGUMENT", `${from} e ${to} não são do mesmo tipo`);
  }
  if (code === "EXDEV") {
    // A mount point inside the checkout. Copying instead would silently stop
    // being atomic, and this is rare enough to name rather than paper over.
    return new DomainError("BLOCKED", `${from} e ${to} estão em filesystems diferentes`);
  }
  if (code === "EACCES" || code === "EPERM") {
    return new DomainError("BLOCKED", `sem permissão para mover ${from}`);
  }
  return error;
}

/** The same contract again, for the errnos removing has. */
function asRemovalFailure(error: unknown, relative: string): unknown {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    return new DomainError("NOT_FOUND", `${relative} não está mais no checkout`);
  }
  if (code === "ENOTEMPTY") {
    // Something landed in the directory between the count and the `rmdir`.
    return new DomainError("BLOCKED", `${relative} deixou de estar vazia`);
  }
  if (code === "EACCES" || code === "EPERM") {
    return new DomainError("BLOCKED", `sem permissão para apagar ${relative}`);
  }
  return error;
}

/**
 * Whether git has a copy of this one entry — the whole of the file dialog.
 *
 * Asked from the entry's own directory, with its bare name as the pathspec, so
 * there is no root-relative arithmetic to get wrong and git finds the
 * repository by walking up on its own. A checkout that is not a repository
 * fails here, and "o git não tem cópia disto" is the true answer for it — the
 * dialog has somewhere to put that and nowhere to put an exception.
 *
 * The index, not `HEAD`: `git checkout -- <path>` restores from the index, so a
 * file that was only `git add`ed does come back.
 */
async function isTracked(entry: string): Promise<boolean> {
  const { stdout } = await execGit(["ls-files", "--error-unmatch", "-z", "--", basename(entry)], {
    cwd: dirname(entry),
  }).catch(() => ({ stdout: "", stderr: "" }));
  return stdout !== "";
}

/**
 * Everything git tracks under a directory, keyed the way the walk keys it.
 *
 * One git process for the whole subtree instead of one per file: a directory
 * with a thousand files would otherwise be a thousand spawns to draw a dialog.
 * Run with the directory as the working directory, so `ls-files` lists only
 * what is under it and prints the paths relative to it.
 */
async function trackedUnder(dir: string): Promise<Set<string>> {
  const { stdout } = await execGit(["ls-files", "-z"], { cwd: dir }).catch(() => ({
    stdout: "",
    stderr: "",
  }));
  return new Set(stdout.split("\0").filter((name) => name !== ""));
}

interface TreeCount {
  files: number;
  dirs: number;
  untracked: number;
  truncated: boolean;
}

/**
 * What a recursive removal would take, counted with a ceiling.
 *
 * Bounded while it walks and not sliced afterwards: the ceiling exists so that
 * `node_modules` costs a few thousand `readdir` entries instead of all of them,
 * and a walk that finishes before trimming has already paid the price the
 * ceiling was for.
 */
async function countTree(dir: string, ceiling: number): Promise<TreeCount> {
  const tracked = await trackedUnder(dir);
  const pending: string[] = [""];
  let files = 0;
  let dirs = 0;
  let untracked = 0;
  let truncated = false;

  while (files + dirs < ceiling) {
    const current = pending.pop();
    if (current === undefined) break;

    const dirents = await readdir(join(dir, current), { withFileTypes: true }).catch(() => null);
    if (dirents === null) {
      // A subdirectory this process cannot list. Saying the numbers are a floor
      // is the honest answer; failing the whole preview would leave the dialog
      // with nothing to show for a directory `rm -r` may well remove.
      truncated = true;
      continue;
    }

    for (const dirent of dirents) {
      if (files + dirs >= ceiling) {
        truncated = true;
        break;
      }
      // Built with `/` and never with `sep`, because the other side of the
      // comparison is git's output and git always prints `/`.
      const child = current === "" ? dirent.name : `${current}/${dirent.name}`;
      // `isDirectory()` is false for a link to one, and that is the point:
      // `rm -r` unlinks the link instead of walking into it, so counting what
      // it points at would describe an operation that never happens — and,
      // for a link out of the checkout, would count a tree that is not ours.
      if (dirent.isDirectory()) {
        dirs += 1;
        pending.push(child);
      } else {
        files += 1;
        if (!tracked.has(child)) untracked += 1;
      }
    }
  }

  // Stopped with directories still to visit: what was counted is a floor.
  if (pending.length > 0) truncated = true;
  return { files, dirs, untracked, truncated };
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
  maxPreviewEntries = MAX_PREVIEW_ENTRIES,
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
      const readOnly = await readOnlyReasonFor(absolute, buffer, text, insideGit);
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

      if (!(await isWritable(target))) {
        // The fifth refusal, and the one this write mechanism creates: the
        // bytes go to a new inode and the `rename` is checked against the
        // *directory*, so without this a 0o444 file is replaced by a daemon
        // that could not put a byte into it in place. Atomicity protects the
        // file from a half write; it is not a way around its permissions.
        //
        // Asked before the revision and before the UTF-8 lock reads the file,
        // in the same order `readOnlyReasonFor` uses: this is a fact about the
        // file, not about this write.
        throw new DomainError(
          "BLOCKED",
          `escrita recusada em ${relative}: o arquivo é somente leitura no disco`,
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

    async createFile(root, path) {
      const { relative, entry } = await resolveForWrite(root, path);

      try {
        // `wx` is `O_CREAT | O_EXCL`: the kernel decides who got the name, in
        // one syscall, with no window. The guard's `exists` is deliberately not
        // consulted — between a check and a write fits the agent creating the
        // same name, and F4.4 asks for DUPLICATE rather than a replacement.
        //
        // Which is why this is not `writeAtomically`: its `rename` replaces
        // whatever is on the target without a word, and no check in front of it
        // closes that. Two mechanisms because they answer different questions.
        //
        // On the entry, never on the target: creating makes a directory entry,
        // and a name held by a link — dangling or not — is a name that is taken.
        await writeFile(entry, "", { flag: "wx" });
      } catch (error) {
        throw asCreationFailure(error, relative);
      }
      // Normalised, and only this side can normalise it: `./src//a.ts` is the
      // same file as `src/a.ts`, and the tree keys on the second.
      return { path: relative };
    },

    async createDir(root, path) {
      const { relative, entry } = await resolveForWrite(root, path);

      try {
        // Not `recursive`: `mkdir -p` would create directories the guard never
        // resolved, one level at a time, and the guard resolves exactly one
        // parent. A missing parent is NOT_FOUND with the directory named.
        await mkdir(entry);
      } catch (error) {
        throw asCreationFailure(error, relative);
      }
      return { path: relative };
    },

    async rename(root, from, to) {
      const source = await resolveForWrite(root, from);
      const destination = await resolveForWrite(root, to);

      if (!source.exists) {
        throw new DomainError("NOT_FOUND", `${source.relative} não existe no checkout`);
      }
      if (destination.exists) {
        // `rename(2)` replaces the destination without a word, and there is no
        // portable exclusive rename to lean on the way creating leans on
        // `O_EXCL`. So this is a check, with the window §5 declares acceptable:
        // the threat model is accident, not adversary. What it is not allowed
        // to be is a silent replace of the agent's file (F4.4).
        throw new DomainError("DUPLICATE", `já existe alguma coisa em ${destination.relative}`);
      }

      try {
        // Entry to entry (Q12): `rename(2)` follows no symlink on either side,
        // which is what makes renaming a link move the link. Through `target`
        // this moves the file the link points at and leaves the link behind
        // pointing at nothing — and `tsc` catches nothing, because `target` is
        // a perfectly good string. This comment is the guard rail there is.
        await rename(source.entry, destination.entry);
      } catch (error) {
        throw asRenameFailure(error, source.relative, destination.relative);
      }
      return { path: destination.relative };
    },

    async remove(root, path, { recursive = false }: RemoveOptions = {}) {
      const { relative, entry, exists } = await resolveForWrite(root, path);
      if (!exists) {
        throw new DomainError("NOT_FOUND", `${relative} não existe no checkout`);
      }

      // `lstat` and never `stat`, `entry` and never `target` (Q12). A link to a
      // directory is one entry to unlink: `stat` calls it a directory and would
      // demand `recursive` to drop a single link, or, given it, walk into the
      // tree it points at. `target` removes what it points at — the file
      // outside the checkout included, which is the one operation this daemon
      // must never perform and the one `tsc` cannot refuse.
      const info = await lstat(entry).catch((error: unknown) => {
        throw asRemovalFailure(error, relative);
      });

      if (!info.isDirectory()) {
        // `unlink` for files, links and everything else with a single entry:
        // it never follows a link, so the destination keeps its bytes.
        await unlink(entry).catch((error: unknown) => {
          throw asRemovalFailure(error, relative);
        });
        return;
      }

      if (recursive) {
        // `fs.rm` decides by `lstat` on the way down, so a link inside the tree
        // is unlinked rather than followed — a recursive delete that walks into
        // a link empties somewhere else entirely.
        await rm(entry, { recursive: true }).catch((error: unknown) => {
          throw asRemovalFailure(error, relative);
        });
        return;
      }

      const inside = await readdir(entry).catch((error: unknown) => {
        throw asRemovalFailure(error, relative);
      });
      if (inside.length > 0) {
        // The count travels with the refusal: the caller asks again knowing the
        // size, which is the whole difference between `rmdir` and `rm -rf`.
        throw new DomainError(
          "BLOCKED",
          `a pasta ${relative} tem ${inside.length} ${inside.length === 1 ? "entrada" : "entradas"} dentro; apagar assim mesmo exige recursive`,
        );
      }
      // `rmdir` and not `fs.rm`: without `recursive`, `fs.rm` refuses every
      // directory, empty ones included, and an empty folder has to be droppable.
      await rmdir(entry).catch((error: unknown) => {
        throw asRemovalFailure(error, relative);
      });
    },

    async deletePreview(root, path) {
      // The same guard the removal itself goes through, so the preview
      // describes an operation that is actually on offer: `.git` and the root
      // refuse here for the same reason they refuse there, and the entry it
      // resolves is the entry that would be unlinked.
      const { relative, entry, exists } = await resolveForWrite(root, path);
      if (!exists) {
        throw new DomainError("NOT_FOUND", `${relative} não existe no checkout`);
      }

      const info = await lstat(entry).catch((error: unknown) => {
        throw asRemovalFailure(error, relative);
      });
      if (!info.isDirectory()) {
        return { kind: "file", path: relative, tracked: await isTracked(entry) };
      }
      return { kind: "dir", path: relative, ...(await countTree(entry, maxPreviewEntries)) };
    },
  };
}
