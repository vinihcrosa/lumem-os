import { z } from "zod";

import { and, eq } from "drizzle-orm";

import { project, session, worktree } from "../db/schema.js";
import { createTaskRepository, TASK_STATUSES } from "../repositories/task.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

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
  /**
   * Os tetos desta feature, como leitura (T13).
   *
   * **Mostrado, e não só existente.** Um teto que você não vê é um teto que você
   * não ajusta — e no dia em que ele recusar, você vai achar que é bug. O valor
   * vem de `LUMEM_TASKS_BUDGET`, o mesmo caminho que o orçamento do auto-learn
   * já usa, e a tela diz o nome da variável para haver **um lugar** que responde
   * "onde eu mudo isso?".
   */
  settings: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      /*
       * A medida de cerimônia (§7 do PRD).
       *
       * `sessões com tarefa ÷ sessões`, e o PRD **espera que não seja 100%**: se
       * for, todo mundo está criando tarefa para agradar o daemon, e o lugar da
       * tarefa está errado. É o único número deste produto cujo valor bom é um
       * intervalo aberto, e por isso ele precisa aparecer — ninguém vai procurar
       * uma métrica que não incomoda.
       *
       * **Escopado ao workspace**, e é o que faz o número descrever o lugar onde
       * ele aparece: a linha é renderizada dentro da lista de um workspace só, e
       * contar o banco inteiro misturaria as sessões de todos eles. Um número
       * que não é do lugar onde está escrito é pior que nenhum — ele parece
       * dado.
       *
       * Contado sobre **todas** as sessões daquele workspace, e não sobre uma
       * janela: cerimônia é hábito, e hábito não cabe em sete dias.
       */
      const counted = await sessionsOfWorkspace(ctx.db, input.workspaceId);

      return {
        budget: ctx.config.taskBudget,
        /** O que ajustar, escrito aqui para a tela não ter que saber. */
        budgetEnv: "LUMEM_TASKS_BUDGET" as const,
        sessions: counted.total,
        sessionsWithTask: counted.withTask,
      };
    }),

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

  /** A tarefa para a qual este checkout existe, ou `null` — o caso mais comum. */
  getByWorktree: publicProcedure
    .input(z.object({ worktreeId: z.string().min(1) }))
    .query(
      async ({ ctx, input }) =>
        (await createTaskRepository(ctx.db).findByWorktree(input.worktreeId)) ?? null,
    ),

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

  /** A tarefa passa a apontar para um checkout que já existe ([T5]). */
  attachWorktree: publicProcedure
    .input(z.object({ id: z.string().min(1), worktreeId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const linked = await createTaskRepository(ctx.db).attachWorktree(
          input.id,
          input.worktreeId,
        );
        ctx.events.emit({ type: "task.changed", workspaceId: linked.workspaceId });
        return linked;
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

/**
 * Quantas sessões deste workspace existem, e quantas servem tarefa.
 *
 * O escopo de uma sessão é polimórfico — projeto ou worktree —, então são duas
 * junções e não uma: `scope_id` aponta para `project.id` ou para `worktree.id`,
 * e nenhum estrangeiro expressa isso. A soma das duas é o denominador honesto.
 */
async function sessionsOfWorkspace(
  db: Context["db"],
  workspaceId: string,
): Promise<{ total: number; withTask: number }> {
  const direct = await db
    .select({ taskId: session.taskId })
    .from(session)
    .innerJoin(project, eq(project.id, session.scopeId))
    .where(and(eq(session.scopeType, "project"), eq(project.workspaceId, workspaceId)));

  const viaWorktree = await db
    .select({ taskId: session.taskId })
    .from(session)
    .innerJoin(worktree, eq(worktree.id, session.scopeId))
    .innerJoin(project, eq(project.id, worktree.projectId))
    .where(and(eq(session.scopeType, "worktree"), eq(project.workspaceId, workspaceId)));

  const rows = [...direct, ...viaWorktree];
  return {
    total: rows.length,
    withTask: rows.filter((row) => row.taskId !== null).length,
  };
}
