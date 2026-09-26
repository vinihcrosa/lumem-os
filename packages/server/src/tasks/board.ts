import { and, eq, inArray } from "drizzle-orm";

import { BOARD_COLUMNS, type BoardCard, type BoardStatus, type Seal } from "@lumem/shared";

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
 *
 * `BOARD_COLUMNS`, `BoardStatus`, `Seal` e o `BoardCard` que atravessa a rede
 * moram em `@lumem/shared` (`032` T9) — reexportados daqui para quem já
 * importa deste arquivo. O que fica **aqui** é o que é do banco: `BoardCardRow`
 * tem `statusChangedAt` e `notifiedAt` como `Date`, porque é o que a query
 * devolve; `toWireCard` é onde a fronteira serializada nasce.
 */
export { BOARD_COLUMNS };
export type { BoardStatus };

/** A linha crua, antes de virar o cartão que atravessa a rede. */
export interface BoardCardRow {
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
  /** Quantas vezes a esteira já tentou **nesta etapa**. `0` é o caso comum. */
  attempts: number;
  /** `off` quando você assumiu o volante — a tela diz isso, e a fila obedece. */
  autonomy: string;
  /** O prompt que o `assistido` montou e não enviou, ou `null`. */
  preparedPrompt: string | null;
  /** Por que a esteira parou aqui, ou `null`. É o que o selo `bloqueada` lê. */
  blockedReason: string | null;
  /** `null` quando você ainda não foi avisado sobre o estado atual (T35). */
  notifiedAt: Date | null;
  /**
   * Está na fila **além das vagas** (`028` Parte 4, T34 · Q54).
   *
   * Não é dado da tarefa: é a posição dela na fila comparada com as vagas
   * livres, calculada na mesma leitura. Vem no cartão porque quem precisa dela
   * é o relógio do encalhe, que é por cartão.
   */
  queuedBeyondSlots: boolean;
}

export interface BoardColumnRows {
  status: BoardStatus;
  cards: BoardCardRow[];
}

/**
 * A linha crua vira o cartão do `shared`, explícito — sem `...spread` (`032`
 * T9). Um campo novo em `BoardCard` que esta função não preenche é erro de
 * tipo **aqui**, no servidor; um campo novo só em `BoardCardRow` que ela não
 * usa não é (excesso via spread não reprova, e é por isso que não há spread).
 */
export function toWireCard(row: BoardCardRow, seal: Seal, notice: string | null): BoardCard {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    projectName: row.projectName,
    worktreeId: row.worktreeId,
    worktreeName: row.worktreeName,
    branch: row.branch,
    position: row.position,
    statusChangedAt: row.statusChangedAt.toISOString(),
    tokens: row.tokens,
    cost: row.cost,
    currency: row.currency,
    turns: row.turns,
    createdBy: row.createdBy,
    links: row.links,
    attempts: row.attempts,
    autonomy: row.autonomy,
    preparedPrompt: row.preparedPrompt,
    queuedBeyondSlots: row.queuedBeyondSlots,
    seal,
    notice,
  };
}

/**
 * Quais cartões estão na fila **além das vagas** (`028` Parte 4, T34).
 *
 * Função pura sobre a fila, e por isso testável sem banco: ela recebe a ordem
 * que a `queueOf` já produziu e as vagas que ela já contou.
 */
export function beyondSlots(
  entries: readonly { task: { id: string } }[],
  slots: number,
): Set<string> {
  // Os primeiros `slots` vão sair na passada seguinte — eles não estão
  // esperando vaga, estão esperando o relógio de 15 segundos. Os outros estão.
  return new Set(entries.slice(Math.max(0, slots)).map((entry) => entry.task.id));
}

export function boardOf(
  db: Db,
  {
    workspaceId,
    projectId,
    waiting = new Set<string>(),
  }: { workspaceId: string; projectId?: string; waiting?: ReadonlySet<string> },
): BoardColumnRows[] {
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
      // O que a esteira acrescentou (`028` Parte 2). Vêm na mesma leitura
      // porque o cartão já está sendo montado — uma segunda consulta por cartão
      // para saber se ele está bloqueado seria sete viagens por pintura.
      attempts: task.attempts,
      autonomy: task.autonomy,
      blockedReason: task.blockedReason,
      preparedPrompt: task.preparedPrompt,
      notifiedAt: task.notifiedAt,
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
          attempts: row.attempts,
          autonomy: row.autonomy,
          preparedPrompt: row.preparedPrompt,
          blockedReason: row.blockedReason,
          queuedBeyondSlots: waiting.has(row.id),
          notifiedAt: row.notifiedAt,
        };
      }),
  }));
}
