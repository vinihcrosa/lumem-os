import { existsSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { WorktreeRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { tryRecordSignal } from "../memory/signals.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

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

/** `~/.lumem/worktrees/<projeto>/<nome>`, F4.4 — outside the repository. */
export function worktreePath(worktreesDir: string, projectName: string, name: string): string {
  return join(worktreesDir, projectName, name);
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

  /**
   * What `create` is about to do, without doing it (onboarding F5.1).
   *
   * The command in the response is built by `worktreeCommand`, which is also what
   * `GitService.addWorktree` runs — one place, so the preview cannot drift from
   * the execution. A second assembly in the client would be a sentence that lies
   * the first time a flag changes.
   */
  plan: publicProcedure
    .input(z.object({ projectId: z.string().min(1), name: nameSchema }))
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const project = await requireProject(ctx, input.projectId);
        const path = worktreePath(ctx.config.worktreesDir, project.name, input.name);

        const [branchTaken, occupied, base] = await Promise.all([
          ctx.git.branchExists(project.path, input.name),
          Promise.resolve(existsSync(path)),
          // The sha the branch would start from. Null in a repository with no
          // commit yet, which is a repository someone can still cut a worktree
          // from — so it reports null instead of refusing.
          ctx.git
            .describe(project.path)
            .then((described) => described.head.shortSha)
            .catch(() => null),
        ]);

        return {
          name: input.name,
          branch: input.name,
          path,
          baseBranch: project.defaultBranch,
          baseSha: base,
          command: `git worktree add -b ${input.name} ${path} ${project.defaultBranch}`,
          /** Said here rather than at creation: the refusal is cheaper before. */
          refusal: branchTaken
            ? `a branch "${input.name}" já existe; escolha outro nome`
            : occupied
              ? `${path} já existe`
              : null,
        };
      }),
    ),

  create: publicProcedure
    .input(z.object({ projectId: z.string().min(1), name: nameSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const project = await requireProject(ctx, input.projectId);
        const path = worktreePath(ctx.config.worktreesDir, project.name, input.name);

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

        // Sinal de ação (Q17): jogar o trabalho fora é o que mais diz sobre
        // ele. Só depois de o git ter sucedido — uma remoção que falhou não
        // descartou nada. `detail` separa "terminei" de "desisti": 1 quando foi
        // preciso forçar por cima de mudanças não salvas, 0 quando saiu limpa.
        // O alvo é o id, nunca o nome da branch, que é frase que você digitou.
        tryRecordSignal(ctx.db, {
          kind: "worktree_discarded",
          target: row.id,
          projectId: row.projectId,
          worktreeId: row.id,
          detail: input.force ? 1 : 0,
        });

        ctx.events.emit({ type: "worktree.changed", projectId: row.projectId });
        return { ok: true as const };
      }),
    ),
});
