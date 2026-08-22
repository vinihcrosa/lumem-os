import type { FastifyBaseLogger } from "fastify";

import { newId } from "@lumem/shared";

import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { sessionUsage } from "../db/schema.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorktreeRepository } from "../repositories/worktree.js";

/**
 * O consumo de cada turno, gravado (`workspace-screen`, W4).
 *
 * O `usage_update` do ACP sempre chegou e nunca foi guardado: ele aparecia na aba
 * que o gastou e sumia com ela. Isto o transforma em linha somável, e a costura é
 * a mesma que a `workspace-memory` já usa — `AcpManager.watchEvents`. Nenhum
 * caminho novo, e nenhuma sessão sabendo o que é consumo.
 *
 * **A conta é de delta.** `used` é a ocupação da janela de contexto, acumulada na
 * sessão; somar `used` entre turnos contaria o mesmo token uma vez por turno. O
 * que se soma é `used - último used desta sessão`, com piso zero.
 *
 * Sessão retomada começa a janela de novo — o adaptador recarrega o contexto —,
 * então o primeiro delta dela é o valor inteiro. É honesto: quem retoma paga o
 * contexto recarregado.
 */

export interface RecordUsageOptions {
  db: Db;
  acpManager: AcpManager;
  log?: Pick<FastifyBaseLogger, "warn">;
}

export function trackSessionUsage({ db, acpManager, log }: RecordUsageOptions): () => void {
  /*
   * O último `used` de cada sessão, em memória.
   *
   * Em memória e não no banco porque isto é estado de uma sessão viva: quando o
   * daemon cai, as sessões caem com ele, e a próxima medição de uma sessão nova
   * começa do zero de qualquer jeito. Guardar no banco só criaria uma linha para
   * manter em sincronia com um processo que já morreu.
   */
  const lastUsed = new Map<string, number>();

  const off = acpManager.watchEvents(({ sessionId, event }) => {
    if (event.type !== "usage") return;

    const previous = lastUsed.get(sessionId) ?? 0;
    lastUsed.set(sessionId, event.used);
    // Piso zero: o adaptador pode reportar uma janela menor depois de compactar a
    // conversa, e "consumiu -12k tokens" não existe.
    const tokens = Math.max(0, event.used - previous);
    const cost = event.cost ?? null;

    // Nada a gravar: turno que não mexeu na janela e não custou dinheiro é linha
    // que só ocupa espaço.
    if (tokens === 0 && cost === null) return;

    void (async () => {
      const scope = await scopeOf(db, sessionId);
      if (scope === null) return;

      db.insert(sessionUsage)
        .values({
          id: newId(),
          sessionId,
          projectId: scope.projectId,
          worktreeId: scope.worktreeId,
          tokens,
          ...(cost === null ? {} : { cost: cost.amount, currency: cost.currency }),
        })
        .run();
    })().catch((error: unknown) => {
      // Contar não pode atrapalhar o turno: isto roda dentro do `emit`, que é o
      // caminho por onde a resposta do agente chega na tela.
      log?.warn({ session: sessionId, err: error }, "falha ao gravar o consumo do turno");
    });
  });

  return () => {
    off();
    lastUsed.clear();
  };
}

/**
 * Quem paga a conta desta sessão.
 *
 * `null` quando a sessão não tem linha no banco — é o caso das sessões que o
 * daemon sobe para si mesmo: a destilação da memória e o agente de pesquisa do
 * auto-learn. O consumo delas é real, e atribuí-lo a um projeto seria contar
 * como trabalho seu algo que o sistema fez por conta própria. Fica de fora, e
 * essa é uma decisão a rever quando alguém perguntar quanto o Lumem gasta
 * sozinho.
 */
async function scopeOf(
  db: Db,
  sessionId: string,
): Promise<{ projectId: string; worktreeId: string } | null> {
  const row = await createSessionRepository(db).findById(sessionId);
  if (row === undefined) return null;

  if (row.scopeType === "project") return { projectId: row.scopeId, worktreeId: "" };

  const worktree = await createWorktreeRepository(db).findById(row.scopeId);
  if (worktree === undefined) return null;
  return { projectId: worktree.projectId, worktreeId: worktree.id };
}
