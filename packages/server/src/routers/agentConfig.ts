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
        /**
         * Defaults to `pty`, so a caller written before ACP existed keeps
         * producing the configuration it used to (A11).
         */
        transport: z.enum(["pty", "acp"]).default("pty"),
        /**
         * Required on `acp`, forbidden on `pty` — the CHECK enforces it, and the
         * repository turns that into a domain error. Present here so the API can
         * do everything the client can (PRD §7): without it an ACP configuration
         * would be creatable only by writing to the database by hand.
         */
        adapterVersion: z.string().trim().min(1).nullish(),
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
