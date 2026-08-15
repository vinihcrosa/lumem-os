import { DomainError } from "./errors.js";
import { createProjectRepository } from "./repositories/project.js";
import { createWorktreeRepository } from "./repositories/worktree.js";
import type { Context } from "./trpc.js";

/**
 * Where a scope lives on disk.
 *
 * Sessions asked this first — F5.1 and F5.2 — and now the files and the diff
 * ask the same question of the same scope. It lives here so the answer cannot
 * drift: a worktree the session router refuses to start in is a worktree the
 * file router must refuse to read from.
 *
 * A worktree whose directory is gone is refused here rather than downstream:
 * node-pty answers a missing cwd with a terminal that exits 1 and prints
 * nothing, and `readdir` answers with an ENOENT nobody translated.
 */
export type ScopeType = "project" | "worktree";

export interface ResolvedScope {
  cwd: string;
  /**
   * The branch this checkout is measured against — the project's recorded
   * default, resolved when it was added and never fetched again, F4.3.
   *
   * The project's own checkout is often *on* that branch, which is the
   * asymmetry right-panel Q7 leaves open: the view exists and comes back empty.
   */
  baseBranch: string;
}

export async function resolveScope(
  ctx: Context,
  scopeType: ScopeType,
  scopeId: string,
): Promise<ResolvedScope> {
  const projects = createProjectRepository(ctx.db);

  if (scopeType === "project") {
    const project = await projects.findById(scopeId);
    if (!project) throw new DomainError("NOT_FOUND", `projeto ${scopeId} não existe`);
    return { cwd: project.path, baseBranch: project.defaultBranch };
  }

  const worktree = await createWorktreeRepository(ctx.db).findById(scopeId);
  if (!worktree) throw new DomainError("NOT_FOUND", `worktree ${scopeId} não existe`);
  if (worktree.state === "missing") {
    throw new DomainError("BLOCKED", `a worktree "${worktree.name}" não está no disco`);
  }

  const project = await projects.findById(worktree.projectId);
  if (!project) {
    throw new DomainError("NOT_FOUND", `projeto ${worktree.projectId} não existe`);
  }
  return { cwd: worktree.path, baseBranch: project.defaultBranch };
}
