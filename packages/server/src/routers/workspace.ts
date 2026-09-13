import { z } from "zod";

import { createWorkspaceRepository } from "../repositories/workspace.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * Workspaces over the wire, PRD F1.1–F1.5.
 *
 * The router validates shape and the repository owns the rules. Nothing here
 * re-checks uniqueness by reading first: two requests can pass that check at
 * the same time, and the database constraint cannot.
 */

/**
 * Trimmed, because " pessoal" and "pessoal" are the same workspace to a person
 * and two different rows to SQLite. Capped so the selector stays a selector.
 */
const nameSchema = z.string().trim().min(1, "o nome não pode ficar vazio").max(80);

const idSchema = z.object({ id: z.string().min(1) });

export const workspaceRouter = router({
  list: publicProcedure.query(({ ctx }) => createWorkspaceRepository(ctx.db).list()),

  get: publicProcedure
    .input(idSchema)
    .query(async ({ ctx, input }) =>
      (await createWorkspaceRepository(ctx.db).findById(input.id)) ?? null,
    ),

  create: publicProcedure.input(z.object({ name: nameSchema })).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const created = await createWorkspaceRepository(ctx.db).create(input);
      ctx.events.emit({ type: "workspace.changed" });
      return created;
    }),
  ),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), name: nameSchema }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const renamed = await createWorkspaceRepository(ctx.db).rename(input.id, input.name);
        ctx.events.emit({ type: "workspace.changed" });
        return renamed;
      }),
    ),

  /**
   * Os três tetos (`028` Parte 3, T18).
   *
   * `null` é **sem teto** e `0` é **bloqueia tudo**, e os dois são escrevíveis:
   * quem quer parar por um momento diz `0` sem apagar o número que configurou.
   * Os três campos são obrigatórios de propósito — *"não mandei"* e *"mandei
   * nada"* precisam ser coisas diferentes, senão desligar um teto não tem gesto.
   */
  setBudget: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        costPerTask: z.number().nonnegative().nullable(),
        costPerDay: z.number().nonnegative().nullable(),
        turnsPerSession: z.number().int().nonnegative().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { id, ...caps } = input;
        const saved = await createWorkspaceRepository(ctx.db).setBudget(id, caps);
        ctx.events.emit({ type: "workspace.changed" });
        return saved;
      }),
    ),

  remove: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      await createWorkspaceRepository(ctx.db).remove(input.id);
      ctx.events.emit({ type: "workspace.changed" });
      return { ok: true as const };
    }),
  ),
});
