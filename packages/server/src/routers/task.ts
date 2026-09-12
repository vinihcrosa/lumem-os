import { z } from "zod";

import { createTaskRepository, TASK_STATUSES } from "../repositories/task.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * Tarefas sobre o fio (`022-workspace-tasks` F1).
 *
 * **Este router é a superfície humana.** Todo caminho daqui escreve com
 * `actor: "human"`, e é o que faz `done` ser seu: o agente fala por outra porta
 * — HTTP, em `task/http.ts` —, e é lá que `actor: "agent"` aparece. Uma
 * procedure que aceitasse o ator como entrada devolveria a decisão a quem
 * chama.
 */

const titleSchema = z.string().trim().min(1, "a tarefa precisa de um título").max(200);
const idSchema = z.object({ id: z.string().min(1) });
const statusSchema = z.enum(TASK_STATUSES);

export const taskRouter = router({
  listByWorkspace: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        status: statusSchema.optional(),
        projectId: z.string().min(1).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      createTaskRepository(ctx.db).listByWorkspace(input.workspaceId, {
        status: input.status,
        projectId: input.projectId,
      }),
    ),

  get: publicProcedure
    .input(idSchema)
    .query(async ({ ctx, input }) => (await createTaskRepository(ctx.db).get(input.id)) ?? null),

  create: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        title: titleSchema,
        body: z.string().optional(),
        links: z.array(z.string().url()).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const created = await createTaskRepository(ctx.db).create({ ...input, actor: "human" });
        ctx.events.emit({ type: "task.changed", workspaceId: created.workspaceId });
        return created;
      }),
    ),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: titleSchema.optional(),
        body: z.string().optional(),
        links: z.array(z.string().url()).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const { id, ...patch } = input;
        const updated = await createTaskRepository(ctx.db).update(id, patch);
        ctx.events.emit({ type: "task.changed", workspaceId: updated.workspaceId });
        return updated;
      }),
    ),

  setStatus: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: statusSchema,
        reason: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const moved = await createTaskRepository(ctx.db).setStatus(input.id, input.status, {
          actor: "human",
          reason: input.reason,
        });
        ctx.events.emit({ type: "task.changed", workspaceId: moved.workspaceId });
        return moved;
      }),
    ),

  remove: publicProcedure.input(idSchema).mutation(({ ctx, input }) =>
    domainSafeAsync(async () => {
      const repository = createTaskRepository(ctx.db);
      // Lido antes de apagar só para saber a quem avisar: depois do delete não
      // há de onde tirar o workspace.
      const found = await repository.get(input.id);
      await repository.remove(input.id);
      if (found) ctx.events.emit({ type: "task.changed", workspaceId: found.workspaceId });
      return { ok: true as const };
    }),
  ),
});
