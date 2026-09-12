import type { FastifyBaseLogger } from "fastify";
import { and, eq } from "drizzle-orm";

import type { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { session, task } from "../db/schema.js";
import type { EventBus } from "../events.js";

/**
 * `in_progress` é derivado, não declarado (`022-workspace-tasks` §3.2, T6).
 *
 * Ninguém aperta um botão "comecei". O daemon observa o **primeiro prompt de
 * uma sessão ligada à tarefa** e move a seta — pela mesma costura que o consumo
 * já usa, `AcpManager.watchEvents`. Sem isto, `in_progress` seria uma afirmação
 * do agente, e o §4 da `028` é categórico: a máquina só move coluna quando o
 * fato é verificável **de fora** do agente.
 *
 * **Só de `open` para `in_progress`, e isso é decisão.** Não de `proposed` — uma
 * proposta ainda não foi aprovada, e começar a trabalhar nela não é a sua
 * aprovação. Não de `review` — o agente pôs `review` de propósito, e desfazer
 * isso porque alguém digitou uma pergunta na conversa apagaria a única coisa que
 * ele sabia dizer. Não de `done` nem `dropped` — os dois são seus.
 *
 * O caminho de volta (`review` → `in_progress`, quando o revisor reprova) é da
 * esteira da `028`, e é um pedido explícito, não um efeito colateral de abrir a
 * conversa.
 */

export interface TrackTaskProgressOptions {
  db: Db;
  acpManager: AcpManager;
  events: EventBus;
  log?: Pick<FastifyBaseLogger, "warn">;
}

export function trackTaskProgress({
  db,
  acpManager,
  events,
  log,
}: TrackTaskProgressOptions): () => void {
  return acpManager.watchEvents(({ sessionId, event }) => {
    // A mensagem da pessoa, que o `prompt` põe na transcrição antes de o agente
    // ouvir. É o primeiro sinal de que um turno começou de verdade — e o único
    // que existe antes de o agente responder qualquer coisa.
    if (event.type !== "message" || event.role !== "user") return;

    void (async () => {
      try {
        const row = await db.query.session.findFirst({ where: eq(session.id, sessionId) });
        if (!row?.taskId) return;

        const moved = await db
          .update(task)
          // Sem `closedAt`: a transição é de `open`, que nunca tem data.
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(and(eq(task.id, row.taskId), eq(task.status, "open")))
          .returning();

        // Zero linhas é o caso normal do segundo prompt em diante — a condição
        // do `where` é o que faz este observador ser idempotente sem guardar
        // estado nenhum em memória.
        const changed = moved[0];
        if (changed) events.emit({ type: "task.changed", workspaceId: changed.workspaceId });
      } catch (error) {
        // Uma tarefa que não avançou é um defeito de tela; uma exceção solta
        // aqui derruba o observador e leva o consumo junto na próxima refatoração
        // que os juntar.
        log?.warn({ err: error, sessionId }, "não consegui mover a tarefa para in_progress");
      }
    })();
  });
}
