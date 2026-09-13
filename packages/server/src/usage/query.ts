import { and, eq, gte, sql } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { agentConfig, project, session, sessionUsage, task, worktree } from "../db/schema.js";

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

/**
 * O mesmo consumo, quebrado por agente (`second-agent`, F5 e C5).
 *
 * Uma linha por par escopo × agente, e **só onde houve consumo** — ao contrário
 * das duas consultas de cima, que trazem o escopo com zero de propósito. A regra
 * é diferente porque a pergunta é: "projeto que não gastou" é uma resposta útil,
 * e "projeto que não gastou com um agente que ele nunca usou" é um produto
 * cartesiano de zeros.
 *
 * `agentConfigId` é anulável nos dois sentidos: a linha gravada antes da coluna
 * existir não tem agente, e a sessão de shell ou de script nunca teve. Nenhuma
 * das duas ganha um agente inventado, e o `name` acompanha — nulo é "não sei",
 * que é diferente de qualquer nome.
 */
export interface AgentUsage extends UsageTotals {
  agentConfigId: string | null;
  name: string | null;
}

export interface ProjectAgentUsage extends AgentUsage {
  projectId: string;
}

export interface WorktreeAgentUsage extends AgentUsage {
  worktreeId: string;
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
 * Quanto cada agente custou, por projeto do workspace.
 *
 * Existe porque ter dois agentes e não poder comparar o que cada um cobrou seria
 * não ter dois agentes (C5). Sai de `session_usage` e não de um join com a
 * `session`: o agente é resolvido na escrita, como o projeto e a worktree, e por
 * isso a soma não depende de uma linha de sessão que pode ter sido apagada.
 */
export function usageByProjectAndAgent(
  db: Db,
  { workspaceId, period, now }: { workspaceId: string; period: UsageWindow; now?: Date },
): ProjectAgentUsage[] {
  const since = windowStart(period, now);

  return db
    .select({
      projectId: sessionUsage.projectId,
      agentConfigId: sessionUsage.agentConfigId,
      // `max` e não `min`: dá no mesmo dentro de um grupo — o join é por id — e
      // é o mesmo truque que a moeda já usa para atravessar um `GROUP BY`.
      name: sql<string | null>`max(${agentConfig.name})`,
      tokens: SUM.tokens,
      cost: SUM.cost,
      currency: SUM.currency,
      turns: SUM.turns,
    })
    .from(sessionUsage)
    .innerJoin(project, eq(project.id, sessionUsage.projectId))
    // `left`, porque a configuração pode ter sido apagada e o consumo dela
    // continua sendo consumo — a tabela não tem estrangeira justamente para isso.
    .leftJoin(agentConfig, eq(agentConfig.id, sessionUsage.agentConfigId))
    .where(and(eq(project.workspaceId, workspaceId), gte(sessionUsage.createdAt, since)))
    .groupBy(sessionUsage.projectId, sessionUsage.agentConfigId)
    .orderBy(sql`${SUM.tokens} desc`)
    .all();
}

/** O mesmo por agente, um nível abaixo: cada worktree de um projeto. */
export function usageByWorktreeAndAgent(
  db: Db,
  { projectId, period, now }: { projectId: string; period: UsageWindow; now?: Date },
): WorktreeAgentUsage[] {
  const since = windowStart(period, now);

  return db
    .select({
      worktreeId: sessionUsage.worktreeId,
      agentConfigId: sessionUsage.agentConfigId,
      name: sql<string | null>`max(${agentConfig.name})`,
      tokens: SUM.tokens,
      cost: SUM.cost,
      currency: SUM.currency,
      turns: SUM.turns,
    })
    .from(sessionUsage)
    .leftJoin(agentConfig, eq(agentConfig.id, sessionUsage.agentConfigId))
    .where(and(eq(sessionUsage.projectId, projectId), gte(sessionUsage.createdAt, since)))
    .groupBy(sessionUsage.worktreeId, sessionUsage.agentConfigId)
    .orderBy(sql`${SUM.tokens} desc`)
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

export interface TaskUsage {
  taskId: string;
  tokens: number;
  cost: number | null;
  currency: string | null;
  turns: number;
}

/**
 * O consumo por tarefa (`022-workspace-tasks` F5).
 *
 * **É a resposta mais barata que o modelo dá de graça**: `session_usage` já
 * tinha sessão, e a sessão passou a ter tarefa. Nenhuma coluna nova, nenhum
 * contador — uma junção.
 *
 * `LEFT JOIN` a partir da tarefa, pelo mesmo motivo do consumo por projeto: a
 * pergunta é "o que cada tarefa gastou", e uma tarefa que ninguém começou
 * continua sendo uma tarefa. Sumir dali faria a lista esconder exatamente o que
 * está esperando alguém.
 *
 * E conta os três `kind` de sessão: se você subiu a aplicação numa `shell` para
 * conferir o que o agente fez, aquilo foi trabalho desta tarefa — mesmo que não
 * tenha custado token nenhum.
 */
export function usageByTask(
  db: Db,
  {
    workspaceId,
    period,
    now,
  }: { workspaceId: string; period: UsageWindow | "all"; now?: Date },
): TaskUsage[] {
  /*
   * `"all"` existe porque o cartão do quadro pergunta outra coisa (`028` §4.2).
   *
   * A tela do workspace pergunta *"quanto isto gastou nos últimos 7 dias"*, e a
   * janela é o ponto. O cartão pergunta **"custo até aqui"** — o total de uma
   * tarefa, que é um número que não tem janela: uma tarefa aberta há dez dias
   * não ficou mais barata por isso.
   *
   * Aqui, e não uma segunda consulta: ter dois lugares somando custo por tarefa
   * é ter dois números que podem discordar, e o dia em que discordarem ninguém
   * saberá qual acreditar.
   */
  const since = period === "all" ? new Date(0) : windowStart(period, now);

  return db
    .select({
      taskId: task.id,
      tokens: SUM.tokens,
      cost: SUM.cost,
      currency: SUM.currency,
      turns: SUM.turns,
    })
    .from(task)
    .leftJoin(session, eq(session.taskId, task.id))
    .leftJoin(
      sessionUsage,
      // O corte de tempo no join, e não no `where`: no `where` ele eliminaria a
      // linha da tarefa que não gastou nada na janela.
      and(eq(sessionUsage.sessionId, session.id), gte(sessionUsage.createdAt, since)),
    )
    .where(eq(task.workspaceId, workspaceId))
    .groupBy(task.id)
    .all();
}

/**
 * O que os três tetos do workspace precisam saber (`028` Parte 3, T15).
 *
 * **Nenhum contador guardado**, e é o mesmo argumento do selo do §4.1: um número
 * somado na hora não pode divergir do que aconteceu, e um contador incrementado
 * pode — basta um turno que morreu entre o gasto e o incremento.
 *
 * Os três saem de `session_usage`, que já tem projeto, worktree, agente, tarefa
 * (pela sessão) e tempo. Nenhuma tabela nova.
 */
export interface BudgetSpend {
  /** O que esta tarefa já gastou, **sem janela** — uma tarefa velha não ficou mais barata. */
  taskCost: number | null;
  taskTokens: number;
  /** O que este workspace gastou **hoje**, com a janela resolvida aqui. */
  dayCost: number | null;
  dayTokens: number;
  /** Quantos turnos esta sessão teve. O chão que todo adaptador informa. */
  sessionTurns: number;
}

export function budgetSpend(
  db: Db,
  {
    workspaceId,
    taskId,
    sessionId,
    now,
  }: { workspaceId: string; taskId: string | null; sessionId: string; now?: Date },
): BudgetSpend {
  const task =
    taskId === null
      ? undefined
      : usageByTask(db, { workspaceId, period: "all" }).find((row) => row.taskId === taskId);

  // A janela do dia é resolvida **no daemon**, como a `010` decidiu: o corte não
  // pode vir do relógio do cliente, senão duas telas abertas em máquinas
  // diferentes dão respostas diferentes para a mesma pergunta.
  const since = windowStart("1d", now);
  const [day] = db
    .select({ cost: SUM.cost, tokens: SUM.tokens })
    .from(sessionUsage)
    .innerJoin(project, eq(project.id, sessionUsage.projectId))
    .where(and(eq(project.workspaceId, workspaceId), gte(sessionUsage.createdAt, since)))
    .all();

  const [session_] = db
    .select({ turns: SUM.turns })
    .from(sessionUsage)
    .where(eq(sessionUsage.sessionId, sessionId))
    .all();

  return {
    taskCost: task?.cost ?? null,
    taskTokens: task?.tokens ?? 0,
    dayCost: day?.cost ?? null,
    dayTokens: day?.tokens ?? 0,
    sessionTurns: session_?.turns ?? 0,
  };
}
