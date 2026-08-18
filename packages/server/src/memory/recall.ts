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
 * - **explicabilidade**: cada resultado diz **por que** apareceu — o lexical
 *   normalizado (com o bm25 bruto ao lado), a recência, e o sinal de uso.
 *   `WhyRecalled` é o nome disso lá.
 */

/** Sem isto, "o que" e "de" derrubam a relevância inteira. */
const STOPWORDS = new Set([
  "a","o","as","os","de","do","da","dos","das","e","ou","que","com","sem","por","para","no","na",
  "nos","nas","um","uma","uns","umas","the","of","and","or","to","in","on","for","is","it","this",
]);

/** Os pesos do ranking. Ficam aqui, com nome, porque são decisão de desenho. */
const WEIGHT = { lexical: 0.7, recency: 0.2, used: 0.1 } as const;

/** Meia-vida da recência, em dias. A curva que o Compozy mediu. */
const HALF_LIFE_DAYS = 14;

/** Quantas recuperações saturam o sinal de uso. */
const USE_SATURATION = 3;

/**
 * Os pesos por coluna do BM25, na ordem das colunas da tabela.
 *
 * O `0.0` de `path` não corrige nada — coluna `UNINDEXED` não tem termo, e o
 * peso dela é inócuo (medido: quatro e cinco pesos dão score idêntico). Ele
 * está aqui para o mapa **posicional** não mentir no dia em que alguém
 * acrescentar coluna. E `slug` fica em 1, junto do corpo, porque ele é derivado
 * do nome: dar 2 a ele seria contar o título duas vezes.
 */
const COLUMN_WEIGHTS = "0.0, 4.0, 3.0, 1.0, 1.0";

/**
 * Quantos candidatos visíveis alimentam a normalização.
 *
 * Fixo, e não `limit * n`: min–max é escala, então um pool que muda com o
 * `limit` faz a mesma pergunta com "mostre mais" reordenar o topo. Só cresce
 * quando o próprio `limit` pedido é maior — não dá para devolver 50 resultados
 * olhando 20 candidatos.
 */
const CANDIDATE_POOL = 20;

/** Teto de varredura do `MATCH`. Sem ele, um acervo quase todo invisível varre tudo. */
const MAX_SCAN = 5_000;

export interface RecallHit {
  entry: MemoryEntryRow;
  score: number;
  /**
   * O BM25 cru, **antes** da normalização.
   *
   * O `score` é relativo aos candidatos desta busca — com um candidato só ele
   * vale o teto. Só este número é comparável entre buscas, e por isso é ele que
   * vira `memory_signal.best_score`.
   */
  bm25: number;
  /** Por que apareceu. Auditável, e é o que a UI mostra quando você pergunta. */
  why: readonly string[];
}

export interface RecallResult {
  hits: readonly RecallHit[];
  /** Preenchido quando a busca **não** rodou. Silêncio aqui viraria "não achei nada". */
  skipped: "trivial_query" | null;
  /**
   * O índice está atrasado em relação ao catálogo — o resultado pode estar curto.
   *
   * Sinal, e não recusa: um arquivo ilegível deixaria a busca inteira morta se
   * isto barrasse. Quem chama avisa; o boot e a CLI consertam.
   */
  staleIndex: boolean;
}

export interface RecallOptions extends ScopeFilter {
  limit?: number;
  /**
   * Registra o uso — sinal por memória e linha em `memory_usage`.
   *
   * **Desligado por default**, e ligado só no caminho do agente. Buscar é uma
   * leitura: se toda chamada registrasse, refetch, retry e remontagem de tela
   * inflariam o próprio número que o §6 quer medir, e o critério objetivo da
   * Q25 passaria a medir o cliente, não o uso.
   */
  record?: boolean;
  sessionId?: string;
}

const FTS_COLUMNS = sql`path UNINDEXED, name, description, slug, body, tokenize = 'unicode61 remove_diacritics 2'`;

/**
 * Zera o índice. Quem o preenche é o `reindex`, lendo o disco.
 *
 * Preencher a partir do catálogo era tentador e é armadilha: o catálogo não
 * guarda corpo, então o índice nasceria mudo para metade das buscas — **e com
 * a contagem batendo**, isto é, se declarando em dia. Estado derivado pela
 * metade que passa na própria verificação de frescor é pior que estado
 * ausente, porque ninguém volta para consertá-lo.
 */
export function resetIndex(db: Db): void {
  db.run(sql`DROP TABLE IF EXISTS memory_fts`);
  db.run(sql`CREATE VIRTUAL TABLE memory_fts USING fts5(${FTS_COLUMNS})`);
}

/** Acrescenta ou substitui uma memória no índice. */
export function indexEntry(db: Db, path: string, name: string, description: string, slug: string, body: string): void {
  ensureIndex(db);
  db.run(sql`DELETE FROM memory_fts WHERE path = ${path}`);
  db.run(
    sql`INSERT INTO memory_fts (path, name, description, slug, body)
        VALUES (${path}, ${name}, ${description}, ${slug}, ${body})`,
  );
}

export function removeFromIndex(db: Db, path: string): void {
  ensureIndex(db);
  db.run(sql`DELETE FROM memory_fts WHERE path = ${path}`);
}

/** O sinal morre com a memória — senão o contador é herdado por quem tem o mesmo nome. */
export function clearSignal(db: Db, path: string): void {
  db.delete(memorySignal).where(eq(memorySignal.path, path)).run();
}

function indexExists(db: Db): boolean {
  const rows = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'`,
  );
  return rows.length > 0;
}

function countOf(db: Db, table: "memory_fts" | "memory_entry"): number {
  const [row] = db.all<{ total: number }>(
    table === "memory_fts"
      ? sql`SELECT COUNT(*) AS total FROM memory_fts`
      : sql`SELECT COUNT(*) AS total FROM memory_entry`,
  );
  return Number(row?.total ?? 0);
}

/**
 * O índice está atrasado em relação ao catálogo?
 *
 * A tabela FTS5 nasce fora das migrations — é derivada, e migration não deriva
 * nada. O preço disso é que um banco com catálogo e sem índice existe: qualquer
 * instalação anterior a esta feature. Sem esta pergunta no boot, a primeira
 * busca acharia um índice vazio e devolveria "nada encontrado" para o acervo
 * inteiro, sem erro e sem sinal.
 */
export function indexIsStale(db: Db): boolean {
  if (!indexExists(db)) return true;
  return countOf(db, "memory_fts") !== countOf(db, "memory_entry");
}

/**
 * Garante que a tabela existe, **vazia**.
 *
 * Vazia e assumidamente atrasada: `indexIsStale` continua dizendo `true` até
 * alguém reler o disco, e é isso que faz o reparo do boot acontecer em vez de
 * ser dispensado por uma contagem que só bate porque foi falsificada.
 */
function ensureIndex(db: Db): void {
  if (indexExists(db)) return;
  resetIndex(db);
}

/**
 * Busca, ranqueia e — se pedido — registra o uso.
 *
 * O ranking é BM25 do FTS5 combinado com **recência** e **sinal de uso**, com a
 * meia-vida de 14 dias que o Compozy mediu. O sinal entra com peso pequeno de
 * propósito: ele diz "isto já foi útil antes", e não "isto responde a pergunta".
 *
 * Os três termos entram **na mesma escala**. O bm25 deste índice vai de ~1e-6
 * (termo frequente no acervo, IDF≈0) a ~14 (termo raro): somado cru, ou ele é
 * ruído perto da recência ou a engole — nunca os três juntos. A normalização é
 * min–max **sobre os candidatos desta busca**, que é o que preserva a distância
 * relativa entre eles: saturar (`x/(1+x)`) achatava o topo a ponto de um
 * casamento três vezes melhor perder para o mais recente.
 */
export function recall(db: Db, query: string, options: RecallOptions = {}): RecallResult {
  const terms = tokenize(query);
  if (terms.length < 2) {
    // Guarda de query trivial: uma palavra casa com meio acervo, e o que volta
    // é ruído com aparência de resposta.
    if (options.record === true) usage(db, "recall", 0, 0, options);
    return { hits: [], skipped: "trivial_query", staleIndex: indexIsStale(db) };
  }

  ensureIndex(db);
  const stale = indexIsStale(db);
  const started = Date.now();
  const limit = options.limit ?? 5;
  const match = terms.map((term) => `"${term}"*`).join(" OR ");

  // O escopo decide o que existe, e o shadow decide o que vale — nesta ordem,
  // porque uma memória sombreada não deve aparecer numa busca do escopo ativo.
  const catalog = db.select().from(memoryEntry).all();
  const { visible } = resolveVisible(catalog, options);
  const byPath = new Map(visible.map((entry) => [entry.path, entry]));

  const signals = new Map(
    db.select().from(memorySignal).all().map((row) => [row.path, row]),
  );

  const pool = candidates(db, match, byPath, limit);
  // O bm25 do SQLite é **negativo**, e mais negativo é melhor: inverter é o que
  // torna o número legível. A escala vem do próprio conjunto de candidatos.
  const scale = normalizer(pool.map((row) => -row.rank));

  const hits: RecallHit[] = [];
  for (const row of pool) {
    const entry = byPath.get(row.path);
    if (entry === undefined) continue;

    const bm25 = -row.rank;
    const lexical = scale(bm25);
    const signal = signals.get(row.path);
    const recency = halfLife(entry.updatedAt, HALF_LIFE_DAYS);
    const used = Math.min(1, (signal?.recallCount ?? 0) / USE_SATURATION);
    const score = WEIGHT.lexical * lexical + WEIGHT.recency * recency + WEIGHT.used * used;

    hits.push({
      entry,
      score,
      bm25,
      why: [
        `lexical=${lexical.toFixed(3)}`,
        `bm25=${bm25.toFixed(3)}`,
        `recencia=${recency.toFixed(3)}`,
        `uso=${used.toFixed(3)}`,
        `score=${score.toFixed(3)}`,
      ],
    });
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, limit);

  if (options.record === true) {
    // O bm25 cru, e não o `score`: o score é relativo aos candidatos desta
    // busca, e resultado único sempre tira o teto. Gravar o relativo faria
    // `best_score` saturar para memória irrelevante — e ele é o critério
    // objetivo que a poda da Q25 vai usar.
    for (const hit of top) bumpSignal(db, hit.entry.path, hit.bm25);
    usage(db, "recall", top.length, Date.now() - started, options);
  }

  return { hits: top, skipped: null, staleIndex: stale };
}

interface Candidate {
  path: string;
  rank: number;
}

/**
 * Os candidatos **visíveis**, paginando o `MATCH` até o pool encher.
 *
 * Cortar no SQL antes do filtro de escopo e de shadow fazia candidato invisível
 * consumir vaga: trinta memórias de outro workspace casando melhor devolviam
 * `hits: 0` com a memória do escopo ativo casando. O corte agora é sobre o que
 * o escopo enxerga, e não sobre o que o índice guarda.
 */
function candidates(
  db: Db,
  match: string,
  byPath: ReadonlyMap<string, MemoryEntryRow>,
  limit: number,
): Candidate[] {
  // O pool é maior que o limite de propósito: recência e uso reordenam, então
  // quem entra no top não é necessariamente quem o bm25 pôs na frente. E a
  // página é o piso — como ela é 50 e o teto de `limit` do router também é 50,
  // o conjunto de candidatos é **o mesmo** para qualquer limite pedido, que é o
  // que impede "mostre mais" de trocar o primeiro colocado.
  const pool = Math.max(CANDIDATE_POOL, limit);
  const page = Math.max(pool, 50);
  const found: Candidate[] = [];
  let offset = 0;

  for (;;) {
    const rows = db.all<Candidate>(
      sql`SELECT path, bm25(memory_fts, ${sql.raw(COLUMN_WEIGHTS)}) AS rank
          FROM memory_fts WHERE memory_fts MATCH ${match}
          ORDER BY rank LIMIT ${page} OFFSET ${offset}`,
    );
    if (rows.length === 0) return found;

    offset += rows.length;
    for (const row of rows) {
      if (byPath.has(row.path)) found.push(row);
    }
    if (found.length >= pool || rows.length < page || offset >= MAX_SCAN) return found;
  }
}

/**
 * A escala do lexical, min–max sobre os candidatos desta busca.
 *
 * Quando todos casam igual — o que acontece de verdade num acervo pequeno, onde
 * o IDF do BM25 colapsa e todo mundo tira zero — não há o que distinguir pelo
 * texto, e o desempate fica com recência e uso.
 */
function normalizer(values: readonly number[]): (value: number) => number {
  if (values.length === 0) return () => 1;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return () => 1;
  return (value) => (value - min) / (max - min);
}

/**
 * O contador que a poda futura vai usar como critério objetivo.
 *
 * `score` aqui é o **bm25 cru**, deliberadamente: é o único número da busca que
 * significa a mesma coisa na busca seguinte.
 */
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
  /** Quantas sessões distintas produziram este uso. `null` fica de fora. */
  sessions: number;
}

/** O resumo que a UI da PR 05 mostra — e que decide se o desenho está de pé. */
export function summarizeUsage(db: Db): UsageSummary[] {
  return db
    .all<UsageSummary>(
      sql`SELECT kind,
                 COUNT(*) AS events,
                 COALESCE(SUM(amount), 0) AS totalAmount,
                 COALESCE(AVG(duration_ms), 0) AS averageDurationMs,
                 COUNT(DISTINCT session_id) AS sessions
          FROM memory_usage GROUP BY kind ORDER BY kind`,
    )
    .map((row) => ({ ...row, averageDurationMs: Math.round(row.averageDurationMs) }));
}

/**
 * Os termos que valem uma busca.
 *
 * `\p{L}\p{N}` e não `a-z0-9`: o índice usa `unicode61` e aceita qualquer
 * alfabeto, então cortar em ASCII fazia `"デプロイ 設定"` e
 * `"как настроить контейнер"` voltarem como `trivial_query` — a busca dizendo
 * "não busquei porque é trivial" quando o que houve foi falha de tokenização.
 *
 * E o corte de tamanho é em 2 e não em 3: `ui`, `v2` e `id` são termos que
 * alguém digita de verdade.
 */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 2 && !STOPWORDS.has(term));
}

/** 1 hoje, 0,5 depois de `days`. A mesma curva que o Compozy usa. */
function halfLife(date: Date, days: number): number {
  const ageDays = (Date.now() - date.getTime()) / 86_400_000;
  return Math.pow(0.5, ageDays / days);
}
