import { z } from "zod";

import { publicProcedure, router } from "../trpc.js";
import {
  usageByProject,
  usageByProjectAndAccount,
  usageByProjectAndAgent,
  usageByTask,
  usageByWorktree,
  usageByWorktreeAndAccount,
  usageByWorktreeAndAgent,
  usageOutsideWorktrees,
  usageTotal,
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
  /**
   * O daemon inteiro numa janela, para o painel da barra (`038`). Sem escopo de
   * entrada: quem olha de fora do workspace quer o que o dia custou, e não uma
   * lista de workspaces para somar do lado de lá.
   */
  total: publicProcedure
    .input(z.object({ period }))
    .query(({ ctx, input }) => usageTotal(ctx.db, { period: input.period })),

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

  /*
   * E um nível abaixo do agente, por conta (`034` T12) — separados pelo mesmo
   * motivo dos de cima: a tela só pede quando algum agente tem mais de uma
   * conta, e com uma o agente já é a conta.
   */
  byProjectAndAccount: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1), period }))
    .query(({ ctx, input }) =>
      usageByProjectAndAccount(ctx.db, { workspaceId: input.workspaceId, period: input.period }),
    ),

  byWorktreeAndAccount: publicProcedure
    .input(z.object({ projectId: z.string().min(1), period }))
    .query(({ ctx, input }) =>
      usageByWorktreeAndAccount(ctx.db, { projectId: input.projectId, period: input.period }),
    ),
});
