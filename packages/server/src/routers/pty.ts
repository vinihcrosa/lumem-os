import { z } from "zod";

import { domainSafe, publicProcedure, router } from "../trpc.js";

/**
 * Control plane for the terminal vertical slice.
 *
 * Deliberately scope-free: every session lands in the daemon's configured
 * default directory. Resolving a cwd from a project or worktree is T29's job,
 * and doing it here would mean building it twice.
 */

const sessionIdInput = z.object({ id: z.string().min(1) });

const sizeInput = z.object({
  cols: z.number().int().min(1).max(5_000).optional(),
  rows: z.number().int().min(1).max(5_000).optional(),
});

export const ptyRouter = router({
  spawnShell: publicProcedure.input(sizeInput.optional()).mutation(({ ctx, input }) =>
    domainSafe(() =>
      ctx.ptyManager.spawn({
        command: ctx.config.shell,
        // A login shell, so the user's own profile, aliases and prompt apply.
        args: ["-l"],
        cwd: ctx.config.defaultCwd,
        ...(input?.cols === undefined ? {} : { cols: input.cols }),
        ...(input?.rows === undefined ? {} : { rows: input.rows }),
      }),
    ),
  ),

  list: publicProcedure.query(({ ctx }) => ctx.ptyManager.list()),

  get: publicProcedure
    .input(sessionIdInput)
    .query(({ ctx, input }) => ctx.ptyManager.get(input.id) ?? null),

  close: publicProcedure.input(sessionIdInput).mutation(({ ctx, input }) =>
    domainSafe(() => {
      ctx.ptyManager.kill(input.id);
      return { ok: true as const };
    }),
  ),
});
