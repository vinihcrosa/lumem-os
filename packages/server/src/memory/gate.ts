import { createHash } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { newId } from "@lumem/shared";

import type { Db } from "../db/index.js";
import { memoryDecision, type MemoryDecisionRow } from "../db/schema.js";

import { describeFindings, scanMemoryContent, type ScanFinding } from "./scan.js";

/**
 * O portão único de escrita.
 *
 * **Toda** escrita passa por aqui — comando, agente, importação, destilação —, e
 * a ordem é fixa e determinística (§7 do PRD):
 *
 * 1. **scan** determinístico: segredo, injeção, Unicode invisível, anotação;
 * 2. **duplicata** por assinatura semântica do conteúdo → `noop`;
 * 3. **identidade `(tipo, slug)`** decide entre `add` e `update`;
 * 4. **decisão persistida antes de tocar o arquivo**.
 *
 * Não há LLM neste caminho (Q13). O que a regra não resolve vira proposta na
 * inbox — que é a PR 05 —, e não palpite.
 *
 * O WAL é o da Q37: guarda a **decisão** e o SHA, nunca o conteúdo anterior. O
 * conteúdo anterior é o commit anterior, e manter os dois seria manter dois
 * históricos do mesmo texto.
 */

export type DecisionOutcome = "applied" | "noop" | "rejected";
export type DecisionOperation = "add" | "update" | "delete";

export interface GateRequest {
  path: string;
  operation: DecisionOperation;
  actor: string;
  confidence: "low" | "medium" | "high";
  /** O texto candidato. Vazio em `delete`. */
  content: string;
  /**
   * A assinatura semântica do candidato e a do que está no disco.
   *
   * Assinatura, e não o texto: o texto carrega `updated_at`, que muda sempre.
   * Ver `entrySignature`.
   */
  signature?: string;
  previousSignature?: string | null;
  /** Chave de idempotência; derivada quando ausente. */
  idempotencyKey?: string;
}

export interface GateDecision {
  outcome: DecisionOutcome;
  /** O texto a gravar — já limpo do Unicode invisível. */
  content: string;
  findings: readonly ScanFinding[];
  reason: string | null;
  idempotencyKey: string;
  candidateHash: string;
}

export function hashOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Decide, sem escrever nada.
 *
 * Separado do registro de propósito: decidir é puro e testável sem banco, e é o
 * mesmo princípio que o estudo do Compozy destacou no coordinator dele —
 * planejar é puro, persistir é transação.
 */
export function decide(request: GateRequest): GateDecision {
  const scan = scanMemoryContent(request.content);
  const candidateHash = hashOf(scan.cleaned);
  // A chave sai da **assinatura**, não do hash do arquivo: o arquivo carrega
  // `updated_at`, que muda a cada tentativa, e duas tentativas da mesma escrita
  // nunca produziriam a mesma chave — o replay prometido pela Q9 não teria como
  // casar a tentativa anterior, e a dedup abaixo seria inalcançável.
  const identity = request.signature ?? scan.cleaned;
  const idempotencyKey =
    request.idempotencyKey ?? `${request.operation}:${request.path}:${hashOf(identity)}`;

  const base = { content: scan.cleaned, findings: scan.findings, idempotencyKey, candidateHash };

  if (scan.verdict === "reject") {
    return { ...base, outcome: "rejected", reason: describeFindings(scan.findings) };
  }

  // Duplicata: reescrever a mesma coisa produziria commit vazio e um
  // `updated_at` novo mentindo que algo mudou.
  if (
    request.operation !== "delete" &&
    request.signature !== undefined &&
    request.signature === request.previousSignature
  ) {
    return { ...base, outcome: "noop", reason: "conteúdo idêntico ao que já está gravado" };
  }

  return { ...base, outcome: "applied", reason: null };
}

export interface RecordDecisionInput extends GateDecision {
  path: string;
  operation: DecisionOperation;
  actor: string;
  confidence: "low" | "medium" | "high";
  /** As sessões que originaram o pedido — a "sessão" que a Q37 pede no WAL. */
  sourceSessions?: readonly string[];
  /** Preenchido depois da escrita, quando houve commit. */
  commitSha?: string | null;
}

/**
 * Grava a decisão. **Antes** da mutação do arquivo, sempre.
 *
 * Antes porque é isso que dá replay: uma decisão registrada e não aplicada é
 * recuperável; uma escrita feita sem registro é invisível. E porque rejeição só
 * existe aqui — ela nunca vira arquivo, nunca vira commit, e é a resposta para
 * "por que isso não foi salvo?".
 */
export function recordDecision(db: Db, input: RecordDecisionInput): MemoryDecisionRow {
  const existing = db
    .select()
    .from(memoryDecision)
    .where(eq(memoryDecision.idempotencyKey, input.idempotencyKey))
    .get();
  if (existing !== undefined) return existing;

  const row = {
    id: newId(),
    idempotencyKey: input.idempotencyKey,
    path: input.path,
    operation: input.operation,
    outcome: input.outcome,
    actor: input.actor,
    confidence: input.confidence,
    candidateHash: input.candidateHash,
    ruleTrace: input.findings.map((finding) => finding.rule),
    sourceSessions: [...(input.sourceSessions ?? [])],
    reason: input.reason,
    commitSha: input.commitSha ?? null,
  };
  db.insert(memoryDecision).values(row).run();
  return db.select().from(memoryDecision).where(eq(memoryDecision.id, row.id)).get() as MemoryDecisionRow;
}

/** Anexa o commit à decisão já registrada — o passo que fecha o ciclo. */
export function attachCommit(db: Db, decisionId: string, commitSha: string | null): void {
  db.update(memoryDecision).set({ commitSha }).where(eq(memoryDecision.id, decisionId)).run();
}

export interface DecisionQuery {
  path?: string;
  limit?: number;
}

/** O histórico de decisões — inclusive o que **não** virou arquivo. */
export function listDecisions(db: Db, { path, limit = 50 }: DecisionQuery = {}): MemoryDecisionRow[] {
  // O filtro vem **antes** de ordenar e limitar. Depois, ele não filtra nada:
  // sobra o topo global recortado, e `--path` vira decoração.
  const selection = db.select().from(memoryDecision);
  const filtered = path === undefined ? selection : selection.where(eq(memoryDecision.path, path));
  return filtered.orderBy(desc(memoryDecision.createdAt)).limit(limit).all();
}
