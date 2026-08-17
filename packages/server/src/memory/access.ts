import { newId } from "@lumem/shared";

import type { Db } from "../db/index.js";
import { memoryAccess, type MemoryAccessRow } from "../db/schema.js";
import { DomainError } from "../errors.js";

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
export function checkAccess(
  db: Db,
  request: AccessRequest,
  capabilities: AccessCapabilities = {},
): AccessResult {
  const result = evaluate(request, capabilities);

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
export function requireAccess(
  db: Db,
  request: AccessRequest,
  capabilities: AccessCapabilities = {},
): void {
  const result = checkAccess(db, request, capabilities);
  if (result.decision === "denied") {
    throw new DomainError("BLOCKED", result.reason ?? "acesso negado");
  }
}

function evaluate(request: AccessRequest, capabilities: AccessCapabilities): AccessResult {
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
  return { decision: "allowed", reason: null };
}

export function listAccess(db: Db, limit = 50): MemoryAccessRow[] {
  return db.select().from(memoryAccess).limit(limit).all();
}
