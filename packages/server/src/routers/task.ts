import { z } from "zod";

import { and, eq } from "drizzle-orm";

import { project, session, worktree } from "../db/schema.js";
import { createTaskRepository, TASK_STATUSES } from "../repositories/task.js";
import { boardOf } from "../tasks/board.js";
import { liveTurnsByTask, pausesByTask, sealOf } from "../tasks/seal.js";
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

/**
 * As colunas em que **alguém está trabalhando**, para o gesto do arrasto (Q40).
 *
 * São as três com papel — as mesmas que o selo chama de `implementador`,
 * `revisor` e `testador` —, e a lista é essa porque o gesto que ela traduz é
 * *"assumi o volante"*: um cartão parado numa delas quer dizer que alguém está
 * nele, e se esse alguém é você a esteira não pode pegar por cima.
 *
 * **`open` não está aqui, e isso foi um erro meu que um teste pegou.** A `open`
 * é a To-Do: arrastar um cartão para lá é **entregá-lo** à máquina, não tirá-lo
 * dela. Com ela na lista, o gesto mais comum do quadro — pôr uma tarefa na fila
 * — desligava a autonomia da tarefa que acabou de ser enfileirada, e a esteira
 * ficava permanentemente vazia sem nada falhar. Quem derrubou foi o caso da
 * `queue.test.ts` que arrasta dentro da própria coluna para provar a prioridade.
 *
 * `ready_to_merge` também não está, e por outro motivo: o §4.1 a criou para
 * marcar *"é a sua vez"*, e arrastar um cartão para lá não é assumir o volante —
 * é devolvê-lo.
 */
const HANDS_ON_COLUMNS = new Set(["in_progress", "review", "testing"]);

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

      /*
       * Os três tetos do workspace (`028` Parte 3, T18).
       *
       * Na mesma leitura que a cerimônia, e pela mesma razão que ela aparece:
       * *"teto que você não vê é teto que parece bug quando recusa"*. `null` é
       * **sem teto**, e a tela diz isso com palavra em vez de campo vazio.
       */
      const space = await ctx.db.query.workspace.findFirst({
        where: (table, { eq: is }) => is(table.id, input.workspaceId),
      });

      return {
        budget: ctx.config.taskBudget,
        /** O que ajustar, escrito aqui para a tela não ter que saber. */
        budgetEnv: "LUMEM_TASKS_BUDGET" as const,
        sessions: counted.total,
        sessionsWithTask: counted.withTask,
        caps: {
          costPerTask: space?.budgetCostPerTask ?? null,
          costPerDay: space?.budgetCostPerDay ?? null,
          turnsPerSession: space?.budgetTurnsPerSession ?? null,
        },
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

  /**
   * O quadro inteiro, numa leitura (`028` F1, T6 e T7).
   *
   * Sete colunas sempre, mesmo vazias, com o selo de cada cartão **derivado** na
   * resposta — nunca guardado. Uma chamada, e não uma por coluna: nenhuma das
   * sete veria as outras, e um cartão que trocasse de coluna no meio apareceria
   * duas vezes ou nenhuma.
   */
  board: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        projectId: z.string().min(1).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const columns = boardOf(ctx.db, input);
      const byTask = liveTurnsByTask(ctx.db, ctx.acpManager.liveTurns());
      const paused = pausesByTask(ctx.db, ctx.acpManager.rateLimits());

      return columns.map((column) => ({
        status: column.status,
        cards: column.cards.map((card) => ({
          ...card,
          seal: sealOf({
            status: column.status,
            liveTurns: byTask.get(card.id) ?? [],
            pausedUntil: paused.get(card.id) ?? null,
          }),
        })),
      }));
    }),

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

  /**
   * O arrasto do quadro: a coluna e o lugar nela (`028` §4.3, T5).
   *
   * `index` é para onde o ponteiro apontou, e o daemon renumera a coluna de
   * destino inteira numa transação — a posição **é** a prioridade, então ela
   * tem que sobreviver a recarregar.
   */
  /**
   * As colunas em que a esteira trabalha.
   *
   * As mesmas quatro etapas devidas da `queue.ts`, e a duplicação é deliberada:
   * ali elas são a **fila** e aqui são a fronteira de um gesto. Importar a lista
   * de lá amarraria o router ao módulo da esteira por uma coincidência de
   * conteúdo — e no dia em que a fila deixar de pegar `open`, o arrasto para a
   * To-Do não deveria mudar de significado junto.
   */
  move: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: statusSchema,
        index: z.number().int().min(0),
        reason: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const tasks = createTaskRepository(ctx.db);
        const moved = await tasks.move(input.id, {
          status: input.status,
          index: input.index,
          actor: "human",
          reason: input.reason,
        });

        /*
         * Arrastar para uma coluna em que alguém trabalha **desliga a autonomia
         * daquela tarefa** (`028` Q40).
         *
         * Não é conceito novo: o §6, Parte 4 já define **assumir** como *"abre a
         * conversa e desliga a autonomia daquela tarefa"*, e a Q40 decidiu que o
         * arrasto é um **segundo caminho para o mesmo interruptor**. Sem isto, a
         * regra da fila pegaria exatamente o cartão que você acabou de puxar
         * para fazer na mão — etapa devida, nenhum trabalhador — e começaria a
         * gastar por cima do seu trabalho.
         *
         * **Só desliga, nunca liga de volta.** Tirar o cartão de uma coluna da
         * máquina não é dizer *"pode pegar"*; quem liga é você, e é um gesto com
         * nome.
         */
        const final =
          HANDS_ON_COLUMNS.has(input.status) && moved.autonomy !== "off"
            ? await tasks.setAutonomy(input.id, "off")
            : moved;

        ctx.events.emit({ type: "task.changed", workspaceId: final.workspaceId });
        return final;
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
