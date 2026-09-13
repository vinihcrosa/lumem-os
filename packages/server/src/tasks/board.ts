import { and, eq, inArray } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { project, task, worktree } from "../db/schema.js";
import { usageByTask } from "../usage/query.js";

/**
 * O quadro, numa leitura (`028-autonomous-orchestration` F1, T6).
 *
 * **Uma chamada serve o quadro inteiro**, e não uma por coluna. Sete viagens
 * para pintar uma tela que existe para ser olhada por cinco segundos seria caro
 * e — pior — **inconsistente**: nenhuma das sete veria as outras, e um cartão
 * que trocasse de coluna no meio apareceria duas vezes ou nenhuma.
 *
 * O que o cartão traz é o §4.2 inteiro, menos duas coisas que não moram aqui:
 *
 * - **o selo** é derivado de sessão viva, e vive em `seal.ts` (T7);
 * - **o `● #87`** vem do `PrCache` que a [`013`] já mantém, e a tela o junta
 *   pela worktree. Trazê-lo por aqui faria a leitura do quadro depender de um
 *   processo `gh` — e o quadro abre muito mais vezes do que a PR muda.
 */

/**
 * As sete etapas do §4, em ordem de leitura.
 *
 * `proposed` e `dropped` **não estão aqui, e isso é a decisão**: o primeiro mora
 * na fila de Propostas da [`022`](../../../../docs/features/022-workspace-tasks/prd.md),
 * e o segundo sai do quadro e vira arquivo. Uma coluna para cada um faria o
 * quadro responder duas perguntas diferentes ao mesmo tempo.
 */
export const BOARD_COLUMNS = [
  "backlog",
  "open",
  "in_progress",
  "review",
  "testing",
  "ready_to_merge",
  "done",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export interface BoardCard {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  /** `null` até alguém cortar o checkout — o estado mais comum na To-Do. */
  worktreeId: string | null;
  worktreeName: string | null;
  branch: string | null;
  /** Onde ele está na coluna. A posição **é** a prioridade (§4.3). */
  position: number;
  /** Desde quando ele está nesta coluna. O sinal de encalhe do §6/F4. */
  statusChangedAt: Date;
  /** Custo **até aqui**, sem janela: uma tarefa velha não ficou mais barata. */
  tokens: number;
  cost: number | null;
  currency: string | null;
  turns: number;
  /** De onde veio. Quem escolhe o glifo é a tela; quem sabe a origem é isto. */
  createdBy: string;
  links: string[];
}

export interface BoardColumnView {
  status: BoardColumn;
  cards: BoardCard[];
}

export function boardOf(
  db: Db,
  { workspaceId, projectId }: { workspaceId: string; projectId?: string },
): BoardColumnView[] {
  const where = [eq(task.workspaceId, workspaceId), inArray(task.status, [...BOARD_COLUMNS])];
  if (projectId) where.push(eq(task.projectId, projectId));

  const rows = db
    .select({
      id: task.id,
      title: task.title,
      status: task.status,
      position: task.position,
      statusChangedAt: task.statusChangedAt,
      createdBy: task.createdBy,
      links: task.links,
      projectId: project.id,
      projectName: project.name,
      worktreeId: worktree.id,
      worktreeName: worktree.name,
      branch: worktree.branch,
    })
    .from(task)
    // `innerJoin` no projeto porque `project_id` é `NOT NULL` com `RESTRICT`:
    // uma tarefa sem projeto não existe. `leftJoin` na worktree porque uma
    // tarefa sem checkout é o estado mais comum da To-Do.
    .innerJoin(project, eq(project.id, task.projectId))
    .leftJoin(worktree, eq(worktree.id, task.worktreeId))
    .where(and(...where))
    .orderBy(task.position)
    .all();

  // O custo vem da mesma função que a tela do workspace usa, com a janela
  // aberta (T6). Duas somas de custo por tarefa seriam dois números que podem
  // discordar, e no dia em que discordassem ninguém saberia qual acreditar.
  const usage = new Map(
    usageByTask(db, { workspaceId, period: "all" }).map((row) => [row.taskId, row]),
  );

  return BOARD_COLUMNS.map((status) => ({
    status,
    // Coluna vazia é uma resposta: um quadro que esconde a etapa sem cartão
    // obriga a pessoa a lembrar quantas etapas existem.
    cards: rows
      .filter((row) => row.status === status)
      .map((row) => {
        const spent = usage.get(row.id);
        return {
          id: row.id,
          title: row.title,
          projectId: row.projectId,
          projectName: row.projectName,
          worktreeId: row.worktreeId,
          worktreeName: row.worktreeName,
          branch: row.branch,
          position: row.position,
          statusChangedAt: row.statusChangedAt,
          tokens: spent?.tokens ?? 0,
          cost: spent?.cost ?? null,
          currency: spent?.currency ?? null,
          turns: spent?.turns ?? 0,
          createdBy: row.createdBy,
          links: JSON.parse(row.links) as string[],
        };
      }),
  }));
}
