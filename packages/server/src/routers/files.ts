import { z } from "zod";

import { createFileService } from "../files/FileService.js";
import { resolveScope } from "../scope.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * The checkout's files over the wire, right-panel F5.1–F5.2.
 *
 * Read-only by construction: there is no write procedure here to review later,
 * which is the whole of decision D5. Everything a client sends goes through
 * `resolveScope` and then the path guard, in that order — the scope decides
 * which directory is the root, and the guard decides whether the path is
 * inside it.
 */

/** Stateless, so it is built once instead of injected through the context. */
const files = createFileService();

const scopeSchema = z.object({
  scopeType: z.enum(["project", "worktree"]),
  scopeId: z.string().min(1),
  /** Root-relative. Empty is the checkout itself; the guard refuses the rest. */
  path: z.string().max(4_096).default(""),
});

const listSchema = scopeSchema.extend({
  /**
   * Raises the ceiling for one call, which is what "listar assim mesmo" asks
   * for after a truncated listing. Bounded so the answer stays a listing.
   */
  limit: z.number().int().min(1).max(20_000).optional(),
});

export const filesRouter = router({
  listDir: publicProcedure.input(listSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
      return files.listDir(cwd, input.path, { maxEntries: input.limit });
    }),
  ),

  read: publicProcedure.input(scopeSchema).query(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);
      return files.readFile(cwd, input.path);
    }),
  ),
});
