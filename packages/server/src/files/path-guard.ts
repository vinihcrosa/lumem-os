import { lstat, readdir, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative as relativeTo,
  sep,
} from "node:path";

import { DomainError } from "../errors.js";

/**
 * The only door between a path the client sent and a path the daemon reads.
 *
 * The daemon runs with the user's permissions and has access to everything they
 * do, so §4 of the right-panel PRD is enforced here and nowhere else:
 *
 * 1. absolute paths are refused, never reinterpreted;
 * 2. `..` is refused *after* normalising — `a/../../b` has to die here;
 * 3. the final check is a realpath comparison with a separator, not a string
 *    prefix: `/repo-malicioso` has `/repo` as a prefix and is not inside it;
 * 4. a symlink resolving outside the root is named as such, because "não
 *    existe" would be a lie the user cannot act on;
 * 5. nothing in this module writes.
 *
 * The file-editor PRD (§5) adds a second door, `resolveForWrite`, for callers
 * that are about to change the disk. It relaxes none of the five above — it
 * only stops requiring the target to exist, since creating a file is asking
 * for a path that is not there yet — and adds three refusals of its own:
 *
 * 6. the parent has to exist and is the one resolved by realpath, so a target
 *    that does not exist cannot become a way around rule 4;
 * 7. `.git` and everything under it refuse writes. The tree still *shows* it
 *    (right-panel Q2): showing and letting write are different things, and an
 *    accidental delete there takes the worktree and the uncommitted work;
 * 8. the checkout root itself is never a write target;
 * 9. every final check runs over the spelling the **disk** has, last component
 *    included. APFS and NTFS are case-insensitive: `.GIT` opens `.git`, and a
 *    check over the name the client typed would refuse `.git` and wave `.GIT`
 *    through — with `remove` behind it, that is the worktree.
 */

/** What the caller gets back: a path proven to live inside the checkout. */
export interface ResolvedPath {
  /** Absolute, symlinks already resolved. Safe to read. */
  absolute: string;
  /** Normalised and root-relative. What the UI shows and echoes back. */
  relative: string;
  /**
   * The `.git` rule's verdict for this path, F1.4.
   *
   * Decided here because this is the only place holding both spellings, and
   * §5 puts the verdict on the server: a client deriving it would be a second
   * copy of the rule, in the browser, free to drift from this one.
   */
  insideGit: boolean;
}

/**
 * A path proven safe to write, whether or not anything is there yet.
 *
 * Two paths, because a symlink makes them different things and the operations
 * split along that line (E5): `remove` and `rename` act on the directory
 * entry, a write acts on what it points at. One field named `absolute` had
 * both callers reaching for the same string and one of them getting the
 * opposite of what it asked for.
 */
export interface WritablePath {
  /** Normalised and root-relative. What the UI shows and echoes back. */
  relative: string;
  /**
   * The directory entry itself, in the disk's own spelling. Never what it
   * points at: unlinking a symlink has to take the link and leave the
   * destination alone, and renaming one moves the link.
   */
  entry: string;
  /**
   * Where the bytes of a write land — the destination when `entry` is a link,
   * so the link stays a link (D5).
   *
   * Null when there is nothing to write to: a dangling link has no proven
   * destination, and creating one is not what "gravar este arquivo" asked
   * for. It is still removable, which is why this is a null and not a throw —
   * `string | null` makes the caller that writes say what it does about it.
   */
  target: string | null;
  /** Something is already on that name. Creating decides DUPLICATE, not us. */
  exists: boolean;
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

/**
 * The root is resolved too: on macOS /tmp is a symlink to /private/tmp, so the
 * same directory spelled two ways would fail the containment check — the same
 * reason `isGitRepo` compares through realpath.
 */
async function realRootOf(root: string): Promise<string> {
  try {
    return await realpath(root);
  } catch {
    throw new DomainError("BLOCKED", `o checkout não está em ${root}`);
  }
}

/**
 * Rules 1 and 2 alone, for callers whose target does not have to exist.
 *
 * The diff needs this: the patch of a deleted file is a legitimate request for
 * a path that is no longer on disk, and resolving it would answer NOT_FOUND to
 * a question that has a good answer.
 */
export function normalizeRelative(requested: string): string {
  if (requested.includes("\0")) {
    throw new DomainError("INVALID_ARGUMENT", "o caminho tem um byte nulo");
  }
  if (isAbsolute(requested)) {
    // Reinterpreting it as relative would silently answer a different question
    // than the one asked, and the client has no business asking this one.
    throw new DomainError("INVALID_ARGUMENT", "o caminho precisa ser relativo ao checkout");
  }

  const normalized = normalize(requested.trim() === "" ? "." : requested);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
    throw new DomainError("INVALID_ARGUMENT", `o caminho "${requested}" sai do checkout`);
  }
  return normalized === "." ? "" : normalized.replace(new RegExp(`${sep}+$`), "");
}

/** The one directory inside the checkout that never accepts a write. */
const GIT_DIR = ".git";

/**
 * `.git` as a whole path component, at any depth.
 *
 * A whole component, never a substring: `.gitignore`, `.gitmodules` and
 * `.github/workflows/ci.yml` are ordinary files people edit all day, and a
 * guard that refuses everything passes every security test and breaks the
 * product. Any depth, though — a nested repository's `.git` destroys history
 * just as well as the root's.
 */
function touchesGit(candidate: string): boolean {
  return candidate.split(sep).includes(GIT_DIR);
}

/** Refuses anything the checkout does not contain, F5.5–F5.6. */
export async function resolveInsideRoot(
  root: string,
  requested: string,
): Promise<ResolvedPath> {
  const relative = normalizeRelative(requested);
  const realRoot = await realRootOf(root);

  const target = join(realRoot, relative);
  let absolute: string;
  try {
    absolute = await realpath(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new DomainError("BLOCKED", `sem permissão de leitura em ${relative || "."}`);
    }
    // A dangling symlink lands here too, and "não existe" is the truth for it.
    throw new DomainError("NOT_FOUND", `${relative || "."} não existe no checkout`);
  }

  if (!inside(realRoot, absolute)) {
    // `target` is the literal path under the root, so it differing from what
    // realpath returned means a link was followed somewhere along it — and the
    // link is rarely the last component: `chaves/id_rsa` escapes because
    // `chaves` is the symlink, not `id_rsa`.
    throw new DomainError(
      "BLOCKED",
      target === absolute
        ? `${relative} está fora do checkout`
        : `${relative} aponta para fora do checkout`,
    );
  }

  // Reading `.git` stays allowed (right-panel Q2); the file just comes back
  // read-only, and the reason travels with it instead of the client guessing.
  const insideGit = touchesGit(relative) || touchesGit(relativeTo(realRoot, absolute));

  return { absolute, relative, insideGit };
}

/**
 * Checked on the requested path *and* again on the resolved one.
 *
 * Once is not enough in either direction. The resolved path alone would miss
 * `atalho -> .git`, where `atalho/config` has no `.git` segment and lands
 * squarely inside it; the requested path alone would miss `.GIT` on a
 * case-insensitive filesystem, and would still miss it if `.git` were a link
 * to somewhere harmless — a name the user reads as the repository either way.
 */
function refuseWritingIntoGit(shown: string, candidate: string): void {
  if (!touchesGit(candidate)) return;
  throw new DomainError(
    "BLOCKED",
    `escrita recusada em ${shown}: o ${GIT_DIR} não é editável pelo Lumem — apagá-lo levaria a worktree e o trabalho não commitado junto`,
  );
}

/**
 * The name a directory really holds, which is not always the one asked for.
 *
 * Rule 9 for the one entry `realpath` cannot answer for: a symlink, where it
 * would follow the link and give back the destination's name. Costs a listing
 * of the parent, paid only when the write target is a link.
 */
async function diskNameOf(parent: string, requested: string): Promise<string> {
  const names = await readdir(parent).catch(() => null);
  if (names === null || names.includes(requested)) return requested;
  const folded = requested.toLowerCase();
  return names.find((name) => name.toLowerCase() === folded) ?? requested;
}

/**
 * The door for callers about to change the disk, file-editor §5.
 *
 * Same five rules, minus the requirement that the target already exist:
 * creating a file is asking for a path that is not there yet. What replaces it
 * is resolving the **parent** by realpath — that is what keeps "o alvo não
 * existe" from becoming a way around rule 4.
 */
export async function resolveForWrite(root: string, requested: string): Promise<WritablePath> {
  const relative = normalizeRelative(requested);
  if (relative === "") {
    // The empty path is the checkout itself. Renaming or removing it is the one
    // accident with no undo, so no write operation accepts it.
    throw new DomainError("INVALID_ARGUMENT", "a raiz do checkout não aceita escrita");
  }
  refuseWritingIntoGit(relative, relative);

  const realRoot = await realRootOf(root);
  const parentRelative = dirname(relative) === "." ? "" : dirname(relative);
  const literalParent = join(realRoot, parentRelative);

  let parent: string;
  try {
    parent = await realpath(literalParent);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new DomainError("BLOCKED", `sem permissão de escrita em ${parentRelative || "."}`);
    }
    // Naming the directory, not the file: the file is not supposed to exist
    // yet, so "a.ts não existe" would be true and useless.
    throw new DomainError(
      "NOT_FOUND",
      `o diretório ${parentRelative || "."} não existe no checkout`,
    );
  }

  if (!inside(realRoot, parent)) {
    throw new DomainError(
      "BLOCKED",
      literalParent === parent
        ? `${parentRelative} está fora do checkout`
        : `${parentRelative} aponta para fora do checkout`,
    );
  }

  const parentInfo = await stat(parent);
  if (!parentInfo.isDirectory()) {
    throw new DomainError("INVALID_ARGUMENT", `${parentRelative} não é um diretório`);
  }

  const literalTarget = join(parent, basename(relative));
  let entry = literalTarget;
  let target: string | null = literalTarget;
  let exists = true;
  try {
    const info = await lstat(literalTarget);
    if (!info.isSymbolicLink()) {
      // Rule 9 for an ordinary entry: realpath is the disk's own spelling, and
      // it is the parent that has been canonical so far — the last component
      // was still whatever the client typed.
      entry = await realpath(literalTarget);
      target = entry;
    } else {
      // `realpath` follows the last link, so the link's own name has to come
      // from the parent's listing instead: `remove` takes the link.
      entry = join(parent, await diskNameOf(parent, basename(relative)));
      // D5: the write lands on the destination, so the link stays a link. A
      // rename over the literal path would turn it into a plain file, silently.
      const destination = await realpath(literalTarget).catch(() => null);
      if (destination !== null && !inside(realRoot, destination)) {
        throw new DomainError("BLOCKED", `${relative} aponta para fora do checkout`);
      }
      // Null for a dangling link: nothing proves where a write would land, and
      // the caller that writes is the one that says so. Removing it is fine —
      // that takes the link, and there is no destination to take with it.
      target = destination;
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new DomainError("BLOCKED", `sem acesso a ${relative}`);
    }
    exists = false;
  }

  // Second pass, now over what the disk really has: the entry's own name, and
  // separately where a write through it would land.
  refuseWritingIntoGit(relative, relativeTo(realRoot, entry));
  if (target !== null) refuseWritingIntoGit(relative, relativeTo(realRoot, target));
  if (entry === realRoot || target === realRoot) {
    throw new DomainError("INVALID_ARGUMENT", "a raiz do checkout não aceita escrita");
  }

  return { relative, entry, target, exists };
}
