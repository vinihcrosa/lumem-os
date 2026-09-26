import { eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { project, session, worktree } from "../db/schema.js";
import { budgetSpend } from "../usage/query.js";
import { decideBudget, type BudgetDecision, type Driver, type WorkspaceBudget } from "./budget.js";

/**
 * O teto desta sessão, lido do banco (`028` Parte 3, T16).
 *
 * É o lado sujo da decisão pura da `budget.ts`: aqui mora o SQL e lá mora a
 * frase com que alguém pode discordar. Quem amarra os dois é o `bootstrap`, que
 * é o único que conhece o banco e o `AcpManager` ao mesmo tempo.
 *
 * **O condutor vem da sessão, e não do banco.** Ele é a única coisa desta função
 * que não é uma linha: quem abriu a conversa é fato do momento em que ela nasceu,
 * e a sessão o carrega desde o `spawn`. Deduzi-lo de `lumem_mode = 'free'` seria
 * confundir a esteira com a sua conversa que atravessou o portão da
 * [`016`](../../../../docs/features/016-session-mode/prd.md) — e aí o teto
 * interromperia justamente quem está olhando.
 */
export function createBudgetSource(db: Db) {
  return async (info: { id: string; driver?: Driver }): Promise<BudgetDecision> => {
    /*
     * O escopo vem da **linha**, e não do `AcpSessionInfo`.
     *
     * O manager não sabe o que é um workspace, e é bom que não saiba: ele é o
     * único arquivo que entende ACP. Quem liga a sessão ao escopo é a tabela, e
     * esta função já vai lê-la de qualquer jeito para saber a tarefa.
     */
    const row = await db.query.session.findFirst({ where: eq(session.id, info.id) });
    if (row === undefined) return { kind: "pass" };

    const workspaceId = await workspaceOf(db, row.scopeType, row.scopeId);
    if (workspaceId === null) return { kind: "pass" };

    const space = await db.query.workspace.findFirst({
      where: (table, { eq: is }) => is(table.id, workspaceId),
    });
    if (space === undefined) return { kind: "pass" };

    const budget: WorkspaceBudget = {
      costPerTask: space.budgetCostPerTask,
      costPerDay: space.budgetCostPerDay,
      turnsPerSession: space.budgetTurnsPerSession,
    };
    // Três `null` é o workspace de quem nunca pediu teto, e é o caso comum: não
    // vale uma soma.
    if (
      budget.costPerTask === null &&
      budget.costPerDay === null &&
      budget.turnsPerSession === null
    ) {
      return { kind: "pass" };
    }

    const spend = budgetSpend(db, {
      workspaceId,
      taskId: row.taskId,
      sessionId: info.id,
    });

    return decideBudget(budget, spend, info.driver ?? "human");
  };
}

/**
 * De qual workspace é esta sessão.
 *
 * O escopo é polimórfico — projeto ou worktree —, e nenhum estrangeiro expressa
 * isso, então são duas leituras e não uma junção.
 */
async function workspaceOf(
  db: Db,
  scopeType: string,
  scopeId: string,
): Promise<string | null> {
  if (scopeType === "project") {
    const row = await db.query.project.findFirst({ where: eq(project.id, scopeId) });
    return row?.workspaceId ?? null;
  }
  const tree = await db.query.worktree.findFirst({ where: eq(worktree.id, scopeId) });
  if (tree === undefined) return null;
  const row = await db.query.project.findFirst({ where: eq(project.id, tree.projectId) });
  return row?.workspaceId ?? null;
}
