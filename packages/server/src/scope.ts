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

export async function resolveScope(
  ctx: Context,
  scopeType: ScopeType,
  scopeId: string,
): Promise<{ cwd: string }> {
  if (scopeType === "project") {
    const project = await createProjectRepository(ctx.db).findById(scopeId);
    if (!project) throw new DomainError("NOT_FOUND", `projeto ${scopeId} não existe`);
    return { cwd: project.path };
  }

  const worktree = await createWorktreeRepository(ctx.db).findById(scopeId);
  if (!worktree) throw new DomainError("NOT_FOUND", `worktree ${scopeId} não existe`);
  if (worktree.state === "missing") {
    throw new DomainError("BLOCKED", `a worktree "${worktree.name}" não está no disco`);
  }
  return { cwd: worktree.path };
}
