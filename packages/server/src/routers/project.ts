import { existsSync } from "node:fs";
import { basename, isAbsolute, normalize } from "node:path";

import { z } from "zod";

import type { ProjectRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createProjectRepository } from "../repositories/project.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * Projects over the wire, PRD F2.1–F2.5.
 *
 * The order of operations in `add` is the whole point: validate against the
 * disk first, register only after. PRD §8 — a refused path leaves nothing
 * behind.
 */

const nameSchema = z.string().trim().min(1, "o nome não pode ficar vazio").max(80);

/**
 * What the sidebar needs beyond the row itself.
 *
 * `available` is computed per request rather than stored: a repository can be
 * moved or unmounted between two calls, and a cached flag would be a lie that
 * outlives the fact.
 */
export interface ProjectView extends ProjectRow {
  available: boolean;
}

function withAvailability(row: ProjectRow): ProjectView {
  return { ...row, available: existsSync(row.path) };
}

const pathSchema = z
  .string()
  .trim()
  .min(1, "informe o caminho do repositório")
  // Absolute, because the daemon's own working directory is meaningless to the
  // person typing — it is wherever they happened to start it from.
  .refine((value) => isAbsolute(value), "o caminho precisa ser absoluto")
  .transform((value) => normalize(value));

export const projectRouter = router({
  listByWorkspace: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await createProjectRepository(ctx.db).listByWorkspace(input.workspaceId);
      // PRD §8: a repository removed from disk stays registered and is shown
      // as unavailable, with its actions blocked.
      return rows.map(withAvailability);
    }),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await createProjectRepository(ctx.db).findById(input.id);
      return row ? withAvailability(row) : null;
    }),

  add: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        path: pathSchema,
        /** Defaults to the directory's own name, F2.3. */
        name: nameSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const check = await ctx.git.isGitRepo(input.path);
        if (!check.ok) {
          // The message names which of the four checks failed — F2.2 is
          // explicit that "invalid path" is not an answer.
          throw new DomainError("INVALID_ARGUMENT", check.message);
        }

        // Before the insert, deliberately: a repository whose branch cannot be
        // resolved is a repository the daemon cannot cut worktrees from, and
        // registering it would only defer the failure to a worse moment.
        const defaultBranch = await ctx.git.resolveDefaultBranch(input.path);

        const created = await createProjectRepository(ctx.db).create({
          workspaceId: input.workspaceId,
          name: input.name ?? basename(input.path),
          path: input.path,
          defaultBranch,
        });
        return withAvailability(created);
      }),
    ),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), name: nameSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () =>
        withAvailability(await createProjectRepository(ctx.db).rename(input.id, input.name)),
      ),
    ),

  remove: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      // F2.5: the registration goes, the disk is never touched. Not even when
      // the worktrees the daemon created live under ~/.lumem.
      await createProjectRepository(ctx.db).remove(input.id);
      return { ok: true as const };
    }),
  ),
});
