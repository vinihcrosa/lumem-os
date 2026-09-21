import type { BoardCard, BoardColumn, BoardStatus } from "@lumem/shared";

export type { BoardCard, BoardColumn, BoardStatus };

/**
 * O contrato do quadro, deste lado (`028` F1).
 *
 * `BoardCard`, `BoardColumn` e `BoardStatus` moram em `@lumem/shared` (`032`
 * T9) — reexportados daqui para quem já importa deste arquivo. Este arquivo
 * fica com o que é do `web`: as funções puras de coluna.
 */

/** O rótulo de cada coluna, e o nome é o do §4 — não o do banco. */
export const COLUMN_LABEL: Record<BoardStatus, string> = {
  backlog: "Backlog",
  open: "To-Do",
  in_progress: "In Progress",
  review: "In Review",
  testing: "Testing",
  ready_to_merge: "Ready to Merge",
  done: "Done",
};

/**
 * As duas pontas, que nascem recolhidas em trilho.
 *
 * O motivo não é espaço, e o desenho de 2026-09-11 é quem o nomeia: `Backlog` e
 * `Done` são as duas únicas colunas **sem linha viva e sem relógio** — elas não
 * são a esteira. Recolher a esteira seria mutilar o quadro; recolher as pontas
 * é dizer o que elas já são.
 */
export const RAIL_BY_DEFAULT: readonly BoardStatus[] = ["backlog", "done"];

/** As colunas que você move. É língua, não cor — pintá-las gastaria um matiz. */
export const YOURS: readonly BoardStatus[] = ["open", "ready_to_merge", "done"];

/**
 * Os limiares de encalhe (§6/F1), em minutos.
 *
 * **O relógio só conta o tempo em que o cartão podia ter andado.** `To-Do` não
 * cobra: com teto, estar parado ali é o desenho — e cobrar o que é desenho é a
 * forma mais rápida de tornar o aviso invisível. `backlog` e `proposed` idem.
 */
const STALE_MINUTES: Partial<Record<BoardStatus, { warn: number; over: number }>> = {
  in_progress: { warn: 30, over: 120 },
  review: { warn: 30, over: 120 },
  testing: { warn: 30, over: 120 },
  // O fim da esteira é você, e você tem uma vida.
  ready_to_merge: { warn: 240, over: 1440 },
};

export type StaleLevel = "warn" | "over";

export function staleLevel(
  card: Pick<BoardCard, "statusChangedAt" | "seal"> & {
    status?: BoardStatus;
    queuedBeyondSlots?: boolean;
  },
  now: number,
  status?: BoardStatus,
): StaleLevel | null {
  const column = status ?? card.status;
  if (column === undefined) return null;
  // Cota não é encalhe: ela volta sozinha, e cobrar por ela seria cobrar por
  // uma espera que não é sua nem do agente.
  if (card.seal.kind === "paused") return null;
  /*
   * Nem esperar vaga (Q54).
   *
   * **Menos em `ready_to_merge`**, e é o único lugar em que as duas leituras
   * coincidem: ali não existe vaga para esperar — a coluna é sua —, então *"há
   * quanto tempo está aqui"* e *"há quanto tempo está sendo ignorado"* são a
   * mesma coisa. Um cartão marcado ali seria um cartão que a fila não deveria
   * ter olhado.
   */
  if (card.queuedBeyondSlots === true && column !== "ready_to_merge") return null;

  const limits = STALE_MINUTES[column];
  if (limits === undefined) return null;

  const minutes = (now - new Date(card.statusChangedAt).getTime()) / 60_000;
  if (minutes >= limits.over) return "over";
  if (minutes >= limits.warn) return "warn";
  return null;
}

/** Quantos cartões desta coluna precisam de você. Alimenta o ponto do cabeçalho. */
export function staleCount(column: BoardColumn, now: number): { warn: number; over: number } {
  let warn = 0;
  let over = 0;
  for (const card of column.cards) {
    const level = staleLevel(card, now, column.status);
    if (level === "over") over += 1;
    else if (level === "warn") warn += 1;
  }
  return { warn, over };
}

/**
 * O filtro *"precisa de mim"*, que é provavelmente a visão mais usada (§4).
 *
 * O que sobra é a lista de coisas que só existem porque você existe: o
 * bloqueio, o encalhe, e a sua vez.
 */
export function needsYou(card: BoardCard, status: BoardStatus, now: number): boolean {
  if (card.seal.kind === "blocked") return true;
  if (YOURS.includes(status) && status !== "done") return true;
  return staleLevel(card, now, status) !== null;
}
