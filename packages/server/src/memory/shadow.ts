import type { MemoryEntryRow } from "../db/schema.js";
import type { MemoryScope } from "./entry.js";

/**
 * Shadow por identidade — **nunca merge** (Q31, e Q53 do projeto).
 *
 * Quando a mesma identidade `(tipo, slug)` existe em mais de um escopo, o mais
 * específico **sombreia** o mais genérico: o perdedor continua no disco, não é
 * surfaceado, e o sombreamento **vira evento**. É a resposta do Compozy, e a
 * razão de ser dela é previsibilidade: concatenar dois textos produz um terceiro
 * que ninguém escreveu e ninguém revisou.
 *
 * "Mais específico" é literal: projeto sabe mais sobre o repositório do que o
 * workspace, e o workspace sabe mais sobre o produto do que a sua preferência
 * global.
 */

const DEPTH: Readonly<Record<MemoryScope, number>> = { project: 2, workspace: 1, global: 0 };

export interface ShadowedPair {
  /** Quem aparece. */
  winner: MemoryEntryRow;
  /** Quem ficou no disco e não é surfaceado. */
  loser: MemoryEntryRow;
}

export interface ResolvedView {
  visible: readonly MemoryEntryRow[];
  shadowed: readonly ShadowedPair[];
}

export interface ScopeFilter {
  workspaceId?: string | null;
  projectId?: string | null;
}

/**
 * O que o escopo ativo **enxerga**, e o que ficou sombreado.
 *
 * O filtro é por pertencimento, não por igualdade: estando no projeto `p1` do
 * workspace `ws1`, o que vale é a memória global, a de `ws1` e a de `p1` — e
 * nada de outro projeto. Memória de projeto vizinho é alcançável por pergunta
 * (a camada 3 do context-delivery), não por herança silenciosa.
 */
export function resolveVisible(
  rows: readonly MemoryEntryRow[],
  filter: ScopeFilter = {},
): ResolvedView {
  const inScope = rows.filter((row) => belongs(row, filter));

  // Agrupar primeiro, escolher depois. Decidir par a par produziria pares com
  // vencedor **intermediário** — "b sombreia a" quando na verdade quem vale é c
  // —, e um registro de sombreamento que mente é pior que nenhum.
  const groups = new Map<string, MemoryEntryRow[]>();
  for (const row of inScope) {
    const key = `${row.type}/${row.slug}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const visible: MemoryEntryRow[] = [];
  const shadowed: ShadowedPair[] = [];

  for (const candidates of groups.values()) {
    const winner = candidates.reduce((best, row) => pick(best, row)[0]);
    visible.push(winner);
    for (const row of candidates) {
      if (row !== winner) shadowed.push({ winner, loser: row });
    }
  }

  return { visible, shadowed };
}

function belongs(row: MemoryEntryRow, filter: ScopeFilter): boolean {
  if (row.scope === "global") return true;
  if (row.workspaceId !== (filter.workspaceId ?? null)) return false;
  if (row.scope === "workspace") return true;
  return row.projectId === (filter.projectId ?? null);
}

/**
 * O mais profundo ganha; empate resolve pelo mais recente.
 *
 * O empate só existe entre memórias do **mesmo** escopo com a mesma identidade,
 * que é bug de curadoria e não caso normal — a Q31 manda isso para a inbox como
 * conflito. Até a inbox existir, escolher a mais recente é o comportamento menos
 * surpreendente, e o sombreamento fica registrado do mesmo jeito.
 */
function pick(a: MemoryEntryRow, b: MemoryEntryRow): [MemoryEntryRow, MemoryEntryRow] {
  const depthA = DEPTH[a.scope as MemoryScope] ?? 0;
  const depthB = DEPTH[b.scope as MemoryScope] ?? 0;
  if (depthA !== depthB) return depthA > depthB ? [a, b] : [b, a];
  return a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
}
