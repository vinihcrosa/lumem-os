import { realpath } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";

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
 */

/** What the caller gets back: a path proven to live inside the checkout. */
export interface ResolvedPath {
  /** Absolute, symlinks already resolved. Safe to read. */
  absolute: string;
  /** Normalised and root-relative. What the UI shows and echoes back. */
  relative: string;
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
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

  // The root is resolved too: on macOS /tmp is a symlink to /private/tmp, so
  // the same directory spelled two ways would fail the containment check —
  // the same reason `isGitRepo` compares through realpath.
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    throw new DomainError("BLOCKED", `o checkout não está em ${root}`);
  }

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
