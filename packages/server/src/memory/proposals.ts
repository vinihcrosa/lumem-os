import { newId } from "@lumem/shared";
import { and, desc, eq, ne } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { memoryProposal, type MemoryProposalRow } from "../db/schema.js";
import { DomainError } from "../errors.js";

import type { MemoryActor, MemoryScope, MemoryType } from "./entry.js";

/**
 * Propostas — a inbox da Q27.
 *
 * **Leitura é livre; escrita para cima é revisada.** Um agente do projeto `api`
 * pode ler tudo que o workspace sabe, e não pode ensinar o workspace sem passar
 * por você. É a assimetria que faz o conceito valer a pena sem transformar um
 * engano de um agente em verdade para N projetos.
 *
 * Quem decide se algo é proposta é `requiresProposal`, e o critério tem duas
 * partes que precisam ser verdadeiras juntas: **quem escreve** e **onde**. Você
 * escrevendo memória de workspace não vira proposta — você é a revisão.
 *
 * O que este módulo **não** garante: que `actor` seja verdade. Ele é declarado
 * por quem chama, e a superfície ainda não prova quem está do outro lado — a
 * pergunta, com o ponto de imposição nomeado, é a
 * [Q38](../../../../docs/prd/workspace-memory/open-questions.md). Enquanto ela
 * estiver aberta, o desvio protege contra engano, não contra quem quer burlá-lo.
 */

/** Os tipos cujo escopo natural é o workspace, e que por isso mais contaminam. */
const WORKSPACE_TYPES: ReadonlySet<MemoryType> = new Set(["domain", "process", "contract"]);

/**
 * Os escopos que atravessam projeto — e por isso passam pela revisão.
 *
 * `global` entra junto com `workspace` porque é **mais largo**: memória global
 * vale em todos os workspaces, e deixá-la livre enquanto a de workspace é
 * revisada seria guardar a porta estreita e deixar a larga aberta (Q27.1).
 */
const REVIEWED_SCOPES: ReadonlySet<MemoryScope> = new Set(["workspace", "global"]);

/** Atores que não são você. */
const NON_HUMAN: ReadonlySet<MemoryActor> = new Set(["agent", "distiller", "auto_research"]);

/**
 * Isto precisa de revisão antes de valer?
 *
 * Sim quando um ator não-humano escreve num escopo que atravessa projeto, ou um
 * tipo cujo escopo natural é o workspace. Só `project` e `reference` dentro do
 * próprio projeto continuam diretos: erram barato, e o repositório desmente.
 */
export function requiresProposal(actor: MemoryActor, scope: MemoryScope, type: MemoryType): boolean {
  if (!NON_HUMAN.has(actor)) return false;
  return REVIEWED_SCOPES.has(scope) || WORKSPACE_TYPES.has(type);
}

export interface CreateProposalInput {
  path: string;
  type: MemoryType;
  scope: MemoryScope;
  slug: string;
  workspaceId?: string | null;
  projectId?: string | null;
  name: string;
  description: string;
  body: string;
  actor: MemoryActor;
  fromProjectId?: string | null;
  sessionId?: string | null;
  confidence: "low" | "medium" | "high";
  evidence?: string | null;
}

export function createProposal(db: Db, input: CreateProposalInput): MemoryProposalRow {
  const id = newId();
  db.insert(memoryProposal)
    .values({
      id,
      path: input.path,
      type: input.type,
      scope: input.scope,
      slug: input.slug,
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      name: input.name,
      description: input.description,
      body: input.body,
      actor: input.actor,
      fromProjectId: input.fromProjectId ?? null,
      sessionId: input.sessionId ?? null,
      confidence: input.confidence,
      evidence: input.evidence ?? null,
      status: "pending",
    })
    .run();
  return db.select().from(memoryProposal).where(eq(memoryProposal.id, id)).get() as MemoryProposalRow;
}

/**
 * O que a inbox pode pedir.
 *
 * `resolved` é um filtro de verdade, e não a soma de duas consultas na tela: a
 * pergunta "o que eu já decidi" é uma só, e quem pergunta não deveria precisar
 * saber que ela tem dois valores possíveis por baixo.
 */
export type ProposalStatusFilter = "pending" | "approved" | "rejected" | "resolved";

export interface ProposalQuery {
  status?: ProposalStatusFilter;
  workspaceId?: string;
  limit?: number;
}

function statusFilter(status: ProposalStatusFilter) {
  return status === "resolved"
    ? ne(memoryProposal.status, "pending")
    : eq(memoryProposal.status, status);
}

export function listProposals(db: Db, query: ProposalQuery = {}): MemoryProposalRow[] {
  const filters = [
    query.status === undefined ? undefined : statusFilter(query.status),
    query.workspaceId === undefined ? undefined : eq(memoryProposal.workspaceId, query.workspaceId),
  ].filter((filter) => filter !== undefined);

  const base = db
    .select()
    .from(memoryProposal)
    .orderBy(desc(memoryProposal.createdAt))
    .limit(query.limit ?? 50);

  return filters.length === 0 ? base.all() : base.where(and(...filters)).all();
}

export function findProposal(db: Db, id: string): MemoryProposalRow {
  const row = db.select().from(memoryProposal).where(eq(memoryProposal.id, id)).get();
  if (row === undefined) throw new DomainError("NOT_FOUND", `proposta ${id} não existe`);
  return row;
}

/**
 * Marca a proposta como resolvida.
 *
 * Resolver é **um estado, não uma remoção**: a proposta rejeitada continua
 * visível, porque "o que o sistema quis ensinar e eu recusei" é exatamente o
 * histórico que responde por que ele insiste num assunto.
 */
export function resolveProposal(
  db: Db,
  id: string,
  status: "approved" | "rejected",
  note?: string,
): MemoryProposalRow {
  const row = findProposal(db, id);
  if (row.status !== "pending") {
    throw new DomainError("BLOCKED", `proposta ${id} já foi ${row.status}`);
  }
  db.update(memoryProposal)
    .set({ status, resolvedAt: new Date(), resolutionNote: note ?? null })
    .where(eq(memoryProposal.id, id))
    .run();
  return findProposal(db, id);
}
