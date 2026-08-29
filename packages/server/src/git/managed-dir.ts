import { lstat, readdir, realpath, rm, rmdir } from "node:fs/promises";
import { dirname } from "node:path";

import { DomainError } from "../errors.js";
import { isInside, worktreesDir } from "../workspace-layout.js";

/**
 * Deleting what the Lumem itself wrote, §4.6 of the PRD.
 *
 * This is the least reversible thing in the feature, so the rules are written
 * as a list rather than as a sentence. The one carrying the weight is A2: the
 * difference between "I delete what the row tells me to" and "I delete what I
 * can prove is mine".
 *
 * The row is not evidence. It was written by an earlier version of this daemon,
 * it may have been edited, and the directory it names may have become a symlink
 * since. What authorises an `rm` is a `realpath` taken **now**.
 */

export interface DeleteManagedInput {
  /** The project's registered path — `<projectHome>/repo`. */
  path: string;
  /** The root everything managed has to live under. */
  workspacesDir: string;
}

/**
 * Removes a cloned repository, F6.9.
 *
 * Idempotent: a directory that is already gone is not an error, because the
 * only thing the caller wants is for it not to be there.
 */
export async function deleteManagedRepo({ path, workspacesDir }: DeleteManagedInput): Promise<void> {
  let info;
  try {
    // A3, and `lstat` rather than `stat`: a symlink is refused, never followed.
    // Following one is how a delete leaves the tree it was proved to be inside.
    info = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  if (info.isSymbolicLink()) {
    throw new DomainError(
      "BLOCKED",
      `${path} é um link simbólico; não vou apagar o que está do outro lado dele`,
    );
  }

  await requireInsideTree(path, workspacesDir);
  await rm(path, { recursive: true, force: true });
}

/**
 * A2.1: the project's own directory, once nothing of ours is left in it.
 *
 * Runs for a project registered by path as well, and deletes nothing of theirs
 * — their repository was never in here. What it collects is the scaffolding the
 * daemon itself created: an empty `worktrees/`, and then the empty home.
 *
 * A home with anything still inside is left alone and is not an error. Whatever
 * is in there was not accounted for, and unaccounted-for bytes are a reason to
 * stop rather than a reason to recurse.
 */
export async function collectEmptyProjectHome(
  home: string,
  workspacesDir: string,
): Promise<boolean> {
  await requireInsideTree(home, workspacesDir).catch(() => {
    throw new DomainError("BLOCKED", `${home} está fora de ${workspacesDir}`);
  });

  await removeIfEmpty(worktreesDir(home));
  return removeIfEmpty(home);
}

async function removeIfEmpty(path: string): Promise<boolean> {
  const entries = await readdir(path).catch(() => null);
  if (entries === null || entries.length > 0) return false;
  await rmdir(path).catch(() => {});
  return true;
}

/**
 * A2. Proved by `realpath` and compared by segment, at the moment of deleting.
 *
 * Compared with a separator rather than by string prefix, for the reason
 * `path-guard.ts` already documents: `/estado/workspaces-malicioso` starts with
 * `/estado/workspaces` and is not inside it.
 */
async function requireInsideTree(path: string, workspacesDir: string): Promise<void> {
  const [real, root] = await Promise.all([
    realpath(path).catch(() => realpath(dirname(path))),
    realpath(workspacesDir).catch(() => workspacesDir),
  ]);
  if (!isInside(real, root)) {
    throw new DomainError(
      "BLOCKED",
      `${path} está fora de ${workspacesDir}; o daemon só apaga o que ele mesmo escreveu`,
    );
  }
}
