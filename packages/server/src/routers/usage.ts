import { z } from "zod";

import { publicProcedure, router } from "../trpc.js";
import {
  usageByProject,
  usageByWorktree,
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
});
