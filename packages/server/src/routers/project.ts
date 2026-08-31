import { existsSync } from "node:fs";
import { basename, isAbsolute, normalize } from "node:path";

import { z } from "zod";

import type { ProjectRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
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

  /**
   * What a repository is, before it is registered (onboarding F4.3).
   *
   * A query, and it writes nothing — the same order `add` already keeps, only
   * with the reading half exposed on its own. The flow has to *show* what it
   * understood before asking for a confirmation, and `add` could only report
   * that after the row existed.
   */
  inspect: publicProcedure.input(z.object({ path: pathSchema })).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const described = await ctx.git.describe(input.path);
      const registered = await createProjectRepository(ctx.db).findByPath(input.path);

      /*
       * The main checkout is one of the entries git lists, and it is not a worktree
       * in the Lumem sense. Dropping it by path is what makes the count mean what
       * the screen says it means: "worktrees já registradas neste repositório".
       */
      const others = described.worktrees.filter(
        (entry) => normalize(entry.path) !== normalize(described.root),
      );

      return {
        path: input.path,
        root: described.root,
        head: described.head,
        origin: described.origin,
        commits: described.commits,
        clean: described.status.clean,
        changedFiles: described.status.changedFiles,
        /** Registered with git. The flow calls them `externas` and touches none. */
        worktrees: others.map((entry) => ({
          path: entry.path,
          branch: entry.branch,
          prunable: entry.prunable,
        })),
        /** Already a project here, so the flow can point at it instead of failing. */
        alreadyRegistered: registered === undefined ? null : { id: registered.id, name: registered.name },
        /** What `add` would use, resolved the same way it resolves it. */
        defaultBranch: await ctx.git.resolveDefaultBranch(input.path).catch(() => null),
      };
    }),
  ),

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
        ctx.events.emit({ type: "project.changed", workspaceId: input.workspaceId });
        return withAvailability(created);
      }),
    ),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), name: nameSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const renamed = await createProjectRepository(ctx.db).rename(input.id, input.name);
        ctx.events.emit({ type: "project.changed", workspaceId: renamed.workspaceId });
        return withAvailability(renamed);
      }),
    ),

  remove: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const projects = createProjectRepository(ctx.db);
      const worktrees = createWorktreeRepository(ctx.db);

      // Removing a project takes its worktree registrations with it (F2.5), so a
      // worktree of the project is a scope about to disappear too — §6 forbids
      // leaving a running session pointing at one as firmly as it does for the
      // project's own sessions. The count folds both together so the message
      // names the real total the user has to close.
      const owned = await worktrees.listByProject(input.id);
      const runningLists = await Promise.all([
        ctx.sessionStore.listRunningInScope("project", input.id),
        ...owned.map((wt) => ctx.sessionStore.listRunningInScope("worktree", wt.id)),
      ]);
      const running = runningLists.reduce((total, list) => total + list.length, 0);
      if (running > 0) {
        throw new DomainError(
          "BLOCKED",
          `o projeto tem ${running} sessão(ões) rodando; encerre-as antes de remover`,
        );
      }

      const row = await projects.findById(input.id);

      // F2.5: the registration goes, the disk is never touched — not the
      // repository at its path, and not the worktrees the daemon cut under
      // ~/.lumem. Their rows go with the project; the directories stay.
      await projects.remove(input.id);
      if (row) {
        ctx.events.emit({ type: "project.changed", workspaceId: row.workspaceId });
        if (owned.length > 0) ctx.events.emit({ type: "worktree.changed", projectId: input.id });
      }
      return { ok: true as const };
    }),
  ),
});
