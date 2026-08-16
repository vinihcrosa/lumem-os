import { lstat, realpath, stat } from "node:fs/promises";
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
 * 8. the checkout root itself is never a write target.
 */

/** What the caller gets back: a path proven to live inside the checkout. */
export interface ResolvedPath {
  /** Absolute, symlinks already resolved. Safe to read. */
  absolute: string;
  /** Normalised and root-relative. What the UI shows and echoes back. */
  relative: string;
}

/** A path proven safe to write, whether or not anything is there yet. */
export interface WritablePath extends ResolvedPath {
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

  return { absolute, relative };
}

/** The one directory inside the checkout that never accepts a write. */
const GIT_DIR = ".git";

/**
 * Checked on the requested path *and* again on the resolved one.
 *
 * Once is not enough: `atalho -> .git` makes `atalho/config` a path with no
 * `.git` segment that lands squarely inside it. Any depth counts — a nested
 * repository's `.git` destroys history just as well as the root's.
 */
function refuseWritingIntoGit(shown: string, candidate: string): void {
  if (!candidate.split(sep).includes(GIT_DIR)) return;
  throw new DomainError(
    "BLOCKED",
    `escrita recusada em ${shown}: o ${GIT_DIR} não é editável pelo Lumem — apagá-lo levaria a worktree e o trabalho não commitado junto`,
  );
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
  let absolute = literalTarget;
  let exists = true;
  try {
    const info = await lstat(literalTarget);
    if (info.isSymbolicLink()) {
      // D5: the write lands on the destination, so the link stays a link. A
      // rename over the literal path would turn it into a plain file, silently.
      const destination = await realpath(literalTarget).catch(() => null);
      if (destination === null) {
        // Nothing proves where a broken link would land, and creating its
        // destination is not what "gravar este arquivo" asked for.
        throw new DomainError("BLOCKED", `${relative} é um link cujo destino não existe`);
      }
      if (!inside(realRoot, destination)) {
        throw new DomainError("BLOCKED", `${relative} aponta para fora do checkout`);
      }
      absolute = destination;
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new DomainError("BLOCKED", `sem acesso a ${relative}`);
    }
    exists = false;
  }

  // Second pass, now over what the links actually resolved to.
  refuseWritingIntoGit(relative, relativeTo(realRoot, absolute));
  if (absolute === realRoot) {
    throw new DomainError("INVALID_ARGUMENT", "a raiz do checkout não aceita escrita");
  }

  return { absolute, relative, exists };
}
