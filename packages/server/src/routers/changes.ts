import { z } from "zod";

import { normalizeRelative } from "../files/path-guard.js";
import { resolveScope } from "../scope.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * The checkout's diff over the wire, right-panel F5.3–F5.4.
 *
 * Read-only, like `files`. The base branch is not something the client sends:
 * it is what the project recorded when it was added, so the two views cannot
 * disagree about what "a base" means.
 */

const scopeSchema = z.object({
  scopeType: z.enum(["project", "worktree"]),
  scopeId: z.string().min(1),
  ref: z.enum(["worktree", "base"]).default("worktree"),
});

export const changesRouter = router({
  list: publicProcedure.input(scopeSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd, baseBranch } = await resolveScope(ctx, input.scopeType, input.scopeId);
      const changes = await ctx.git.listChanges(cwd, { ref: input.ref, baseBranch });
      // Echoed back because the UI writes the branch's name on the toggle, and
      // deriving it a second time on the client would be a second source.
      return { ...changes, baseBranch };
    }),
  ),

  patch: publicProcedure
    .input(scopeSchema.extend({ path: z.string().min(1).max(4_096) }))
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { cwd, baseBranch } = await resolveScope(ctx, input.scopeType, input.scopeId);
        // Normalised, not resolved: the patch of a *deleted* file is a good
        // question about a path that is no longer on disk. Escaping is still
        // refused — a pathspec with `..` would reach outside the checkout.
        const file = normalizeRelative(input.path);
        return ctx.git.filePatch(cwd, file, { ref: input.ref, baseBranch });
      }),
    ),
});
