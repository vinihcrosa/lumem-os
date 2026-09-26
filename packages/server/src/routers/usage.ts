import { z } from "zod";

import { publicProcedure, router } from "../trpc.js";
import {
  usageByProject,
  usageByProjectAndAgent,
  usageByTask,
  usageByWorktree,
  usageByWorktreeAndAgent,
  usageOutsideWorktrees,
  USAGE_WINDOWS,
} from "../usage/query.js";

/**
 * O consumo, por escopo e por janela (`workspace-screen`, W4).
 *
 * A janela chega como **nome** e nunca como data: quem sabe que horas são é quem
 * tem o dado. Uma tela aberta desde ontem que mandasse o próprio `since` pediria
 * "últimos 7 dias" a partir de ontem, e duas máquinas dariam duas respostas para
 * a mesma pergunta.
 */

const period = z.enum(USAGE_WINDOWS).default("7d");

export const usageRouter = router({
  /** O que cada projeto do workspace gastou. Projeto sem consumo vem com zero. */
  byProject: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1), period }))
    .query(({ ctx, input }) =>
      usageByProject(ctx.db, { workspaceId: input.workspaceId, period: input.period }),
    ),

  /**
   * O mesmo número um nível abaixo, mais o que rodou direto no projeto.
   *
   * As duas coisas na mesma resposta porque elas só fazem sentido juntas: a soma
   * das worktrees **não** fecha com o total do projeto, e a diferença é
   * exatamente `outside`. Em duas chamadas, a tela poderia mostrar uma sem a
   * outra e o número faltando não teria explicação.
   */
  byWorktree: publicProcedure
    .input(z.object({ projectId: z.string().min(1), period }))
    .query(({ ctx, input }) => ({
      worktrees: usageByWorktree(ctx.db, {
        projectId: input.projectId,
        period: input.period,
      }),
      outside: usageOutsideWorktrees(ctx.db, {
        projectId: input.projectId,
        period: input.period,
      }),
    })),

  /*
   * O mesmo consumo por agente (`second-agent`, F5).
   *
   * Procedimentos separados, e não um `groupBy` nos dois de cima: a resposta
   * agrupada tem uma linha por par, e enfiá-la na mesma chamada mudaria a forma
   * do que a tela do workspace já lê. A tela só pede isto quando há **mais de um
   * agente** — com um, a coluna não existe e a chamada não acontece (C5).
   */
  /**
   * O que cada tarefa do workspace gastou (`022` F5).
   *
   * Uma chamada para a lista inteira, e não uma por linha: a lista já tem N
   * tarefas na tela, e N requisições para somar N números é o desenho que faz
   * uma tela de sete linhas parecer lenta.
   */
  byTask: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1), period }))
    .query(({ ctx, input }) =>
      usageByTask(ctx.db, { workspaceId: input.workspaceId, period: input.period }),
    ),

  byProjectAndAgent: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1), period }))
    .query(({ ctx, input }) =>
      usageByProjectAndAgent(ctx.db, { workspaceId: input.workspaceId, period: input.period }),
    ),

  byWorktreeAndAgent: publicProcedure
    .input(z.object({ projectId: z.string().min(1), period }))
    .query(({ ctx, input }) =>
      usageByWorktreeAndAgent(ctx.db, { projectId: input.projectId, period: input.period }),
    ),
});
