import { z } from "zod";

import { isCommandAvailable } from "../agents/availability.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * Agent configurations over the wire, PRD F6.2 and F6.5.
 *
 * `available` is computed per request rather than stored: the user can install
 * or remove the CLI at any time, and a cached flag would be wrong exactly when
 * it matters.
 */
const nameSchema = z.string().trim().min(1).max(80);

export const agentConfigRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await createAgentConfigRepository(ctx.db).list();
    return rows.map((row) => ({ ...row, available: isCommandAvailable(row.command) }));
  }),

  create: publicProcedure
    .input(
      z.object({
        name: nameSchema,
        command: z.string().trim().min(1),
        args: z.array(z.string()).default([]),
        env: z.record(z.string()).default({}),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() => createAgentConfigRepository(ctx.db).create(input)),
    ),

  remove: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      await createAgentConfigRepository(ctx.db).remove(input.id);
      return { ok: true as const };
    }),
  ),
});
