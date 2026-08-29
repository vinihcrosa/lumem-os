import { existsSync } from "node:fs";

import { z } from "zod";

import type { WorktreeRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";
import { homeOfProject } from "./project.js";
import { worktreeDir } from "../workspace-layout.js";

/**
 * Worktrees over the wire, PRD F4.1–F4.10.
 *
 * This is where git and the database meet, and the order is the requirement:
 * git first, registry second. A registration without a checkout is the state
 * PRD §8 forbids, and it is the one a user cannot fix from the UI.
 */

/**
 * Branch-name rules, F4.5, minus the ones that would let a name escape its
 * directory or be read as a flag.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, "informe um nome")
  .max(120)
  .refine((value) => !value.startsWith("-"), "o nome não pode começar com '-'")
  .refine((value) => !value.includes(".."), "o nome não pode conter '..'")
  .refine((value) => !value.startsWith("/") && !value.endsWith("/"), "barra sobrando no nome")
  .refine((value) => !/[\s~^:?*[\\]/.test(value), "o nome tem caracteres que o git não aceita");

const idSchema = z.object({ id: z.string().min(1) });

export interface WorktreeView extends WorktreeRow {
  /** The directory is where the registry says it is. */
  present: boolean;
}

function withPresence(row: WorktreeRow): WorktreeView {
  return { ...row, present: existsSync(row.path) };
}

async function requireProject(ctx: Context, projectId: string) {
  const project = await createProjectRepository(ctx.db).findById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", `projeto ${projectId} não existe`);
  return project;
}


export const worktreeRouter = router({
  listByProject: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await createWorktreeRepository(ctx.db).listByProject(input.projectId);
      return rows.map(withPresence);
    }),

  create: publicProcedure
    .input(z.object({ projectId: z.string().min(1), name: nameSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const project = await requireProject(ctx, input.projectId);

        // F6.13. Without a commit there is nothing to cut from: the branch
        // exists as a name and not as a commit, and git answers "invalid
        // reference", which explains nothing. The screen avoids it, the server
        // forbids it — and a repository cloned empty is legitimate (Q19), so
        // this is a state a project can simply be in for a while.
        if (!(await ctx.git.hasCommits(project.path))) {
          throw new DomainError(
            "BLOCKED",
            `o repositório ${project.name} ainda não tem nenhum commit — faça o primeiro para poder cortar worktrees`,
          );
        }

        // The same tree for a cloned project and for one registered by path:
        // `projectHome` is a function of (workspace, project) and never of
        // `managed` (A16). The one without a clone simply has no `repo/`.
        const path = worktreeDir(await homeOfProject(ctx, project), input.name);

        // git first. If this throws — branch taken, target occupied, repository
        // gone — nothing has been written, which is exactly what §8 requires.
        // The branch comes from `default_branch` as recorded when the project
        // was added, with no fetch: F4.3 says use what is on disk.
        await ctx.git.addWorktree({
          repoPath: project.path,
          branch: input.name,
          targetPath: path,
          baseBranch: project.defaultBranch,
        });

        try {
          const created = await createWorktreeRepository(ctx.db).create({
            projectId: project.id,
            name: input.name,
            branch: input.name,
            path,
          });
          ctx.events.emit({ type: "worktree.changed", projectId: project.id });
          return withPresence(created);
        } catch (error) {
          // The registry refused what git already did — a duplicate name that
          // git had no opinion about. Leaving the checkout would produce a
          // directory the daemon does not know about and cannot clean up.
          await ctx.git
            .removeWorktree({ repoPath: project.path, path, force: true })
            .catch(() => {});
          throw error;
        }
      }),
    ),

  getDetail: publicProcedure.input(idSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const worktrees = createWorktreeRepository(ctx.db);
      const row = await worktrees.findById(input.id);
      if (!row) throw new DomainError("NOT_FOUND", `worktree ${input.id} não existe`);
      const project = await requireProject(ctx, row.projectId);

      const view = withPresence(row);
      if (!view.present) {
        // F4.10 without a directory to read: report what is registered and say
        // the rest is unknown rather than failing the whole panel.
        return { ...view, status: null, aheadBehind: null, baseBranch: project.defaultBranch };
      }

      const [status, aheadBehind] = await Promise.all([
        ctx.git.getStatus(row.path),
        ctx.git
          .getAheadBehind(row.path, project.defaultBranch)
          // A base branch that was deleted after the fact is not a reason to
          // hide the branch, the path and the cleanliness.
          .catch(() => null),
      ]);

      return { ...view, status, aheadBehind, baseBranch: project.defaultBranch };
    }),
  ),

  remove: publicProcedure
    .input(z.object({ id: z.string().min(1), force: z.boolean().default(false) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const worktrees = createWorktreeRepository(ctx.db);
        const row = await worktrees.findById(input.id);
        if (!row) throw new DomainError("NOT_FOUND", `worktree ${input.id} não existe`);
        const project = await requireProject(ctx, row.projectId);

        // F4.9, checked before the dirt check so the message names the reason
        // the user has to act on first. There is no `force` past this one: a
        // live process holding the directory has to be closed, not overridden,
        // and §6 forbids leaving a session pointing at a scope that is gone.
        const running = await ctx.sessionStore.listRunningInScope("worktree", row.id);
        if (running.length > 0) {
          throw new DomainError(
            "BLOCKED",
            `a worktree tem ${running.length} sessão(ões) rodando; encerre-as antes de remover`,
          );
        }

        if (existsSync(row.path) && !input.force) {
          // F4.8: the count, not just "dirty". "3 arquivos modificados" is a
          // decision the user can make; "suja" is a wall.
          const status = await ctx.git.getStatus(row.path);
          if (!status.clean) {
            throw new DomainError(
              "BLOCKED",
              `a worktree tem ${status.changedFiles} arquivo(s) modificado(s); confirme para remover mesmo assim`,
            );
          }
        }

        if (existsSync(row.path)) {
          // F4.7: the checkout goes, the branch stays.
          await ctx.git.removeWorktree({
            repoPath: project.path,
            path: row.path,
            force: input.force,
          });
        }

        await worktrees.remove(row.id);
        ctx.events.emit({ type: "worktree.changed", projectId: row.projectId });
        return { ok: true as const };
      }),
    ),
});
