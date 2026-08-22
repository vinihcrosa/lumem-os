import { and, eq, gte, sql } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { project, sessionUsage, worktree } from "../db/schema.js";

/**
 * O que cada escopo consumiu numa janela de tempo (`workspace-screen`, W4).
 *
 * **A janela é resolvida aqui, no daemon.** O corte de "últimos 7 dias" não pode
 * vir do relógio do cliente: duas telas abertas em máquinas diferentes — ou a
 * mesma tela aberta desde ontem — dariam respostas diferentes para a mesma
 * pergunta. O cliente manda o **nome** da janela; quem sabe que horas são é quem
 * tem o dado.
 *
 * **Projeto sem consumo aparece com zero.** "Não gastou" é uma resposta, e uma
 * lista que esconde o que não gastou obriga a pessoa a lembrar o que deveria
 * estar ali.
 */

export const USAGE_WINDOWS = ["1d", "7d", "1m", "6m", "1y"] as const;
export type UsageWindow = (typeof USAGE_WINDOWS)[number];

const DAY = 86_400_000;

/** Quantos dias cada janela cobre. Mês é 30 dias, ano é 365 — sem calendário. */
const DAYS: Readonly<Record<UsageWindow, number>> = {
  "1d": 1,
  "7d": 7,
  "1m": 30,
  "6m": 182,
  "1y": 365,
};

export function windowStart(period: UsageWindow, now = new Date()): Date {
  return new Date(now.getTime() - DAYS[period] * DAY);
}

export interface UsageTotals {
  tokens: number;
  /** `null` quando nenhum turno reportou dinheiro — diferente de zero. */
  cost: number | null;
  currency: string | null;
  /** Quantos turnos entraram na conta. É o que diz se o número é sólido. */
  turns: number;
}

export interface ProjectUsage extends UsageTotals {
  projectId: string;
  name: string;
}

export interface WorktreeUsage extends UsageTotals {
  worktreeId: string;
  name: string;
}

const SUM = {
  tokens: sql<number>`coalesce(sum(${sessionUsage.tokens}), 0)`,
  // `sum` de coluna toda nula devolve `NULL`, e é justamente o que queremos: a
  // diferença entre "ninguém reportou custo" e "custou zero".
  cost: sql<number | null>`sum(${sessionUsage.cost})`,
  currency: sql<string | null>`max(${sessionUsage.currency})`,
  /*
   * `count(id)` e não `count(*)`: com `LEFT JOIN`, a linha do projeto que não
   * gastou nada existe com todas as colunas do consumo nulas, e `count(*)`
   * contaria **ela** — o projeto sem consumo reportava "1 turno". `count` de uma
   * coluna ignora nulo, que é exatamente a pergunta.
   */
  turns: sql<number>`count(${sessionUsage.id})`,
};

/**
 * O consumo de cada projeto de um workspace.
 *
 * `LEFT JOIN` a partir do projeto, e não do consumo: a pergunta é "o que cada
 * projeto gastou", e um projeto que não gastou nada continua sendo um projeto.
 */
export function usageByProject(
  db: Db,
  { workspaceId, period, now }: { workspaceId: string; period: UsageWindow; now?: Date },
): ProjectUsage[] {
  const since = windowStart(period, now);

  return db
    .select({
      projectId: project.id,
      name: project.name,
      tokens: SUM.tokens,
      cost: SUM.cost,
      currency: SUM.currency,
      turns: SUM.turns,
    })
    .from(project)
    .leftJoin(
      sessionUsage,
      // O corte de tempo vai **no join**, não no `where`: no `where` ele
      // eliminaria a linha do projeto que não gastou nada na janela, e a lista
      // voltaria a esconder quem não gastou.
      and(eq(sessionUsage.projectId, project.id), gte(sessionUsage.createdAt, since)),
    )
    .where(eq(project.workspaceId, workspaceId))
    .groupBy(project.id)
    .orderBy(sql`${SUM.tokens} desc`, project.name)
    .all();
}

/** O mesmo número, um nível abaixo: cada worktree de um projeto. */
export function usageByWorktree(
  db: Db,
  { projectId, period, now }: { projectId: string; period: UsageWindow; now?: Date },
): WorktreeUsage[] {
  const since = windowStart(period, now);

  return db
    .select({
      worktreeId: worktree.id,
      name: worktree.name,
      tokens: SUM.tokens,
      cost: SUM.cost,
      currency: SUM.currency,
      turns: SUM.turns,
    })
    .from(worktree)
    .leftJoin(
      sessionUsage,
      and(eq(sessionUsage.worktreeId, worktree.id), gte(sessionUsage.createdAt, since)),
    )
    .where(eq(worktree.projectId, projectId))
    .groupBy(worktree.id)
    .orderBy(sql`${SUM.tokens} desc`, worktree.name)
    .all();
}

/**
 * O total do projeto, incluindo o que rodou **direto nele** e não numa worktree.
 *
 * Existe porque a soma das worktrees não fecha com o total do projeto: uma sessão
 * de escopo `project` grava `worktree_id = ''`. Sem esta linha, a visão do projeto
 * mostraria menos do que a do workspace para o mesmo projeto, e ninguém saberia
 * onde foi a diferença.
 */
export function usageOutsideWorktrees(
  db: Db,
  { projectId, period, now }: { projectId: string; period: UsageWindow; now?: Date },
): UsageTotals {
  const since = windowStart(period, now);

  const [row] = db
    .select({ tokens: SUM.tokens, cost: SUM.cost, currency: SUM.currency, turns: SUM.turns })
    .from(sessionUsage)
    .where(
      and(
        eq(sessionUsage.projectId, projectId),
        eq(sessionUsage.worktreeId, ""),
        gte(sessionUsage.createdAt, since),
      ),
    )
    .all();

  return row ?? { tokens: 0, cost: null, currency: null, turns: 0 };
}
