import { newId } from "@lumem/shared";
import { eq, sql } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { memoryEntry, memorySignal, memoryUsage, type MemoryEntryRow } from "../db/schema.js";

import { resolveVisible, type ScopeFilter } from "./shadow.js";

/**
 * O recall — lexical, determinístico e **explicável** (Q22).
 *
 * FTS5 sobre uma tabela virtual construída a partir do catálogo, com o mesmo
 * contrato do resto: o índice é derivado, e `reindex` o refaz. Sem embeddings
 * no v1, e com a interface aqui sendo a costura por onde eles entram depois —
 * o serviço responde a uma **pergunta**, e o que está atrás dela é problema
 * dele.
 *
 * Duas regras que vêm direto do estudo do Compozy, e que são o que separa um
 * recall útil de um gerador de ruído:
 *
 * - **guarda de query trivial**: menos de dois termos significativos não busca,
 *   devolve vazio com motivo. Não gasta contexto à toa;
 * - **explicabilidade**: cada resultado diz **por que** apareceu — o score
 *   bruto do BM25, a recência, e o sinal de uso. `WhyRecalled` é o nome disso lá.
 */

/** Sem isto, "o que" e "de" derrubam a relevância inteira. */
const STOPWORDS = new Set([
  "a","o","as","os","de","do","da","dos","das","e","ou","que","com","sem","por","para","no","na",
  "nos","nas","um","uma","uns","umas","the","of","and","or","to","in","on","for","is","it","this",
]);

export interface RecallHit {
  entry: MemoryEntryRow;
  score: number;
  /** Por que apareceu. Auditável, e é o que a UI mostra quando você pergunta. */
  why: readonly string[];
}

export interface RecallResult {
  hits: readonly RecallHit[];
  /** Preenchido quando a busca **não** rodou. Silêncio aqui viraria "não achei nada". */
  skipped: "trivial_query" | null;
}

export interface RecallOptions extends ScopeFilter {
  limit?: number;
  /** Registra o uso. Desligado no teste que só quer o ranking. */
  record?: boolean;
  sessionId?: string;
}

/** Cria a tabela FTS5 e a preenche a partir do catálogo. Derivada, sempre. */
export function rebuildIndex(db: Db): number {
  db.run(sql`DROP TABLE IF EXISTS memory_fts`);
  db.run(
    sql`CREATE VIRTUAL TABLE memory_fts USING fts5(
      path UNINDEXED, name, description, slug, body, tokenize = 'unicode61 remove_diacritics 2'
    )`,
  );
  const { changes } = db.run(
    sql`INSERT INTO memory_fts (path, name, description, slug, body)
        SELECT path, name, description, slug, '' FROM memory_entry`,
  );
  return Number(changes);
}

/** Acrescenta ou substitui uma memória no índice. */
export function indexEntry(db: Db, path: string, name: string, description: string, slug: string, body: string): void {
  ensureTable(db);
  db.run(sql`DELETE FROM memory_fts WHERE path = ${path}`);
  db.run(
    sql`INSERT INTO memory_fts (path, name, description, slug, body)
        VALUES (${path}, ${name}, ${description}, ${slug}, ${body})`,
  );
}

export function removeFromIndex(db: Db, path: string): void {
  ensureTable(db);
  db.run(sql`DELETE FROM memory_fts WHERE path = ${path}`);
}

function ensureTable(db: Db): void {
  db.run(
    sql`CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      path UNINDEXED, name, description, slug, body, tokenize = 'unicode61 remove_diacritics 2'
    )`,
  );
}

/**
 * Busca, ranqueia e — se pedido — registra o uso.
 *
 * O ranking é BM25 do FTS5 combinado com **recência** e **sinal de uso**, com a
 * meia-vida de 14 dias que o Compozy mediu. O sinal entra com peso pequeno de
 * propósito: ele diz "isto já foi útil antes", e não "isto responde a pergunta".
 */
export function recall(db: Db, query: string, options: RecallOptions = {}): RecallResult {
  const terms = tokenize(query);
  if (terms.length < 2) {
    // Guarda de query trivial: uma palavra casa com meio acervo, e o que volta
    // é ruído com aparência de resposta.
    if (options.record !== false) usage(db, "recall", 0, 0, options);
    return { hits: [], skipped: "trivial_query" };
  }

  ensureTable(db);
  const started = Date.now();
  const match = terms.map((term) => `"${term}"*`).join(" OR ");

  const rows = db.all<{ path: string; rank: number }>(
    sql`SELECT path, bm25(memory_fts, 4.0, 3.0, 2.0, 1.0) AS rank
        FROM memory_fts WHERE memory_fts MATCH ${match}
        ORDER BY rank LIMIT ${(options.limit ?? 5) * 4}`,
  );

  // O escopo decide o que existe, e o shadow decide o que vale — nesta ordem,
  // porque uma memória sombreada não deve aparecer numa busca do escopo ativo.
  const catalog = db.select().from(memoryEntry).all();
  const { visible } = resolveVisible(catalog, options);
  const byPath = new Map(visible.map((entry) => [entry.path, entry]));

  const signals = new Map(
    db.select().from(memorySignal).all().map((row) => [row.path, row]),
  );

  const hits: RecallHit[] = [];
  for (const row of rows) {
    const entry = byPath.get(row.path);
    if (entry === undefined) continue;

    // O bm25 do SQLite é **negativo**, e mais negativo é melhor. Inverter é o
    // que torna o número legível para qualquer um que leia a explicação.
    const lexical = -row.rank;
    const signal = signals.get(row.path);
    const recency = halfLife(entry.updatedAt, 14);
    const used = Math.min(1, (signal?.recallCount ?? 0) / 3);
    const score = 0.7 * lexical + 0.2 * recency + 0.1 * used;

    hits.push({
      entry,
      score,
      why: [
        `lexical=${lexical.toFixed(3)}`,
        `recencia=${recency.toFixed(3)}`,
        `uso=${used.toFixed(3)}`,
        `score=${score.toFixed(3)}`,
      ],
    });
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, options.limit ?? 5);

  if (options.record !== false) {
    for (const hit of top) bumpSignal(db, hit.entry.path, hit.score);
    usage(db, "recall", top.length, Date.now() - started, options);
  }

  return { hits: top, skipped: null };
}

/** O contador que a poda futura vai usar como critério objetivo. */
export function bumpSignal(db: Db, path: string, score: number): void {
  const existing = db.select().from(memorySignal).where(eq(memorySignal.path, path)).get();
  if (existing === undefined) {
    db.insert(memorySignal)
      .values({ path, recallCount: 1, lastRecalledAt: new Date(), bestScore: score })
      .run();
    return;
  }
  db.update(memorySignal)
    .set({
      recallCount: existing.recallCount + 1,
      lastRecalledAt: new Date(),
      bestScore: Math.max(existing.bestScore, score),
    })
    .where(eq(memorySignal.path, path))
    .run();
}

export interface UsageOptions {
  sessionId?: string;
  workspaceId?: string | null;
  projectId?: string | null;
}

/** Um evento de uso. É o §6 do context-delivery virando linha. */
export function usage(
  db: Db,
  kind: "recall" | "read" | "write" | "inject",
  amount: number,
  durationMs: number,
  options: UsageOptions = {},
): void {
  db.insert(memoryUsage)
    .values({
      id: newId(),
      kind,
      sessionId: options.sessionId ?? null,
      workspaceId: options.workspaceId ?? null,
      projectId: options.projectId ?? null,
      amount,
      durationMs,
    })
    .run();
}

export interface UsageSummary {
  kind: string;
  events: number;
  totalAmount: number;
  averageDurationMs: number;
}

/** O resumo que a UI da PR 05 mostra — e que decide se o desenho está de pé. */
export function summarizeUsage(db: Db): UsageSummary[] {
  return db
    .all<UsageSummary>(
      sql`SELECT kind,
                 COUNT(*) AS events,
                 COALESCE(SUM(amount), 0) AS totalAmount,
                 COALESCE(AVG(duration_ms), 0) AS averageDurationMs
          FROM memory_usage GROUP BY kind ORDER BY kind`,
    )
    .map((row) => ({ ...row, averageDurationMs: Math.round(row.averageDurationMs) }));
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !STOPWORDS.has(term));
}

/** 1 hoje, 0,5 depois de `days`. A mesma curva que o Compozy usa. */
function halfLife(date: Date, days: number): number {
  const ageDays = (Date.now() - date.getTime()) / 86_400_000;
  return Math.pow(0.5, ageDays / days);
}
