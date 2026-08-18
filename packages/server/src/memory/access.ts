import { desc, eq } from "drizzle-orm";

import { newId } from "@lumem/shared";

import type { Db } from "../db/index.js";
import { memoryAccess, project, type MemoryAccessRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { resolveInsideRoot } from "../files/path-guard.js";

/**
 * O funil de acesso cross-projeto — **nasce aqui, desligado** (D8).
 *
 * A decisão foi que ler os repositórios do workspace é objetivo declarado, e
 * não hipótese: *"os projetos devem ter algum nível de acesso aos outros
 * projetos"*. Mas isso faz do serviço de memória um agente com acesso a disco,
 * cruzando a fronteira do §11 do PRD.
 *
 * A consequência para esta PR é a que está escrita aqui: **o funil existe agora,
 * com a capacidade desligada, e o registro de acesso já funcionando.** Construir
 * o funil depois seria retrabalho no ponto mais sensível do sistema — e um
 * registro que só passa a existir junto com a permissão nunca cobre o período em
 * que a permissão foi concedida.
 *
 * O que vale hoje, e é a assimetria decidida na Q26 e na Q27:
 *
 * | Ação | Hoje |
 * |---|---|
 * | ler memória do workspace, ou de qualquer projeto dele | **livre**, e registrada |
 * | ler **arquivo** de outro repositório | **negada**, com motivo |
 * | escrever memória de workspace por agente | proposta (PR 05) |
 */

export type AccessKind = "memory" | "repository";
export type AccessDecision = "allowed" | "denied";

export interface AccessRequest {
  /** Quem está pedindo — o projeto da sessão. */
  fromProjectId: string | null;
  /** O que ele quer alcançar. */
  targetProjectId: string | null;
  workspaceId: string | null;
  kind: AccessKind;
  /** Para `repository`: o caminho pedido. Só registrado, nunca aberto hoje. */
  target: string;
  actor: string;
}

export interface AccessCapabilities {
  /**
   * Ler arquivo de repositório vizinho. **Desligada por padrão**, e é a chave
   * que a D8 mandou existir antes do uso.
   */
  readNeighbourRepository?: boolean;
}

export interface AccessResult {
  decision: AccessDecision;
  reason: string | null;
}

/**
 * Decide e **registra**. Sempre nessa ordem, e sempre registrando os dois casos.
 *
 * Registrar só o que foi permitido responderia "o que foi lido"; registrar
 * também o negado responde "o que alguém tentou ler", que é a pergunta que
 * importa quando algo dá errado.
 */
export async function checkAccess(
  db: Db,
  request: AccessRequest,
  capabilities: AccessCapabilities = {},
): Promise<AccessResult> {
  const result = await evaluate(db, request, capabilities);

  db.insert(memoryAccess)
    .values({
      id: newId(),
      workspaceId: request.workspaceId,
      fromProjectId: request.fromProjectId,
      targetProjectId: request.targetProjectId,
      kind: request.kind,
      target: request.target,
      decision: result.decision,
      reason: result.reason,
      actor: request.actor,
    })
    .run();

  return result;
}

/** Como acima, mas estourando — para quem chama num caminho que não trata negativa. */
export async function requireAccess(
  db: Db,
  request: AccessRequest,
  capabilities: AccessCapabilities = {},
): Promise<void> {
  const result = await checkAccess(db, request, capabilities);
  if (result.decision === "denied") {
    throw new DomainError("BLOCKED", result.reason ?? "acesso negado");
  }
}

async function evaluate(
  db: Db,
  request: AccessRequest,
  capabilities: AccessCapabilities,
): Promise<AccessResult> {
  if (request.kind === "memory") {
    // Q26: leitura de memória é livre dentro do workspace. É o ponto de o
    // workspace existir, e restringir seria construir a feature e desligá-la.
    return { decision: "allowed", reason: null };
  }

  if (capabilities.readNeighbourRepository !== true) {
    return {
      decision: "denied",
      reason: "ler repositório vizinho está desligado nesta versão (D8)",
    };
  }

  // As três coisas que a D8 exige, e a capacidade ligada é só a primeira. Uma
  // capacidade que libera *qualquer* projeto e *qualquer* caminho não é funil.
  if (request.targetProjectId === null) {
    return { decision: "denied", reason: "sem projeto alvo: não há raiz para conter o caminho" };
  }
  if (request.workspaceId === null) {
    return { decision: "denied", reason: "sem workspace de origem: a fronteira do §11 é o workspace" };
  }

  const target = db.select().from(project).where(eq(project.id, request.targetProjectId)).get();
  if (target === undefined) {
    return { decision: "denied", reason: `projeto ${request.targetProjectId} não existe` };
  }
  // A lista de projetos que ele pode ler é a do **workspace**, e sai do banco:
  // uma allowlist mantida à mão seria uma segunda verdade sobre quem mora onde.
  if (target.workspaceId !== request.workspaceId) {
    return {
      decision: "denied",
      reason: `projeto ${request.targetProjectId} não pertence ao workspace ${request.workspaceId}`,
    };
  }

  // A mesma guarda da `file-editor`: `realpath`, caminho relativo, e symlink que
  // sai da raiz recusado. Reusada, e não reescrita — duas cópias divergem.
  try {
    await resolveInsideRoot(target.path, request.target);
  } catch (error) {
    return {
      decision: "denied",
      reason: error instanceof DomainError ? error.message : `caminho recusado: ${request.target}`,
    };
  }

  return { decision: "allowed", reason: null };
}

/**
 * O registro, do mais recente para o mais antigo.
 *
 * A ordem é o que faz a auditoria servir: sem ela o `limit` devolve os 50 mais
 * **antigos**, e a tabela para de mostrar o que acabou de acontecer assim que
 * cresce. O irmão `listDecisions` já ordenava assim.
 */
export function listAccess(db: Db, limit = 50): MemoryAccessRow[] {
  return db.select().from(memoryAccess).orderBy(desc(memoryAccess.createdAt)).limit(limit).all();
}
