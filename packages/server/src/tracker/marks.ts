import { and, eq, like, not } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { task, type TaskRow } from "../db/schema.js";

import type { TrackerHost } from "./TrackerHost.js";

/**
 * O que o tracker vê acontecer (`028` §6, Parte 6 — T46 e T47).
 *
 * **Escrever de volta é cortesia, não portão**
 * ([Q64](../../../../docs/features/028-autonomous-orchestration/open-questions.md)): o trabalho já
 * aconteceu do lado de cá, e recusar o avanço porque o host não respondeu seria
 * o produto ficando refém de um terceiro que o
 * [ADR do segredo](../../../../docs/adr/2026-09-13-1531-tracker-credentials-come-from-the-environment.md)
 * acabou de decidir tratar como opcional.
 *
 * **E cada marco é escrito uma vez**, com a mesma regra do `notified_at` da
 * Parte 4 — a condição no `WHERE`, não num `if` antes. Aqui ela importa mais:
 * um `notified_at` duplicado é uma notificação a mais na sua tela, e um marco
 * duplicado é um comentário a mais **na issue de outra pessoa**, que é a única
 * parte disto que não tem desfazer.
 */

/** Os quatro do §6, na ordem em que a tarefa os atravessa. */
export const MARKS = ["taken", "pr", "blocked", "ready"] as const;
export type Mark = (typeof MARKS)[number];

/** A frase de cada um. Curta, e em português como toda comunicação do produto. */
const SENTENCE: Record<Mark, (context: string) => string> = {
  taken: () => "O Lumem pegou esta tarefa.",
  pr: (pr) => `PR ${pr} aberta.`,
  blocked: (why) => `Travei: ${why}`,
  ready: () => "Pronta para mesclar.",
};

export function marksOf(row: Pick<TaskRow, "externalMarks">): Mark[] {
  try {
    return JSON.parse(row.externalMarks) as Mark[];
  } catch {
    // Coluna corrompida não pode parar a esteira, e o pior que acontece é um
    // marco repetido — contra um `throw` que pararia o laço de todo mundo.
    return [];
  }
}

export interface MarkDeps {
  db: Db;
  host: TrackerHost;
  /** Onde o retrato de uma escrita que falhou vai parar. */
  log?: { warn(payload: Record<string, unknown>, message: string): void };
}

/**
 * Escreve um marco, se ele ainda não foi escrito.
 *
 * Devolve se **esta** chamada escreveu. `false` é o caso comum depois da
 * primeira, e também o que uma falha de rede produz — de propósito: quem chama
 * não deve fazer nada diferente nos dois casos, porque em nenhum dos dois o
 * trabalho daqui mudou.
 */
export async function writeMark(
  { db, host, log }: MarkDeps,
  taskId: string,
  mark: Mark,
  context = "",
): Promise<boolean> {
  if (!host.available()) return false;

  const row = await db.query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row?.externalId || row.externalSource !== host.id) return false;

  /*
   * A reserva acontece **antes** da escrita, e é aqui que a corrida é fechada.
   *
   * Duas passadas ao mesmo tempo: a primeira reserva e escreve, a segunda não
   * reserva e não escreve. O `WHERE` com `NOT LIKE` é a condição — a mesma
   * forma do `notified_at`, e pelo mesmo motivo.
   *
   * O custo de reservar antes é escrever a reserva de um comentário que a rede
   * depois recusa: o marco fica registrado sem ter saído. É o lado certo de
   * errar — o outro é comentar duas vezes na issue de alguém.
   */
  const reserved = await db
    .update(task)
    .set({
      externalMarks: JSON.stringify([...marksOf(row), mark]),
      updatedAt: new Date(),
    })
    .where(and(eq(task.id, taskId), not(like(task.externalMarks, `%"${mark}"%`))))
    .returning({ id: task.id });
  if (reserved.length === 0) return false;

  try {
    await host.comment(row.externalId, SENTENCE[mark](context));
    return true;
  } catch (error) {
    /*
     * Falhar **não para nada** do lado de cá. Vira aviso, e não tentativa
     * infinita: o §8 nomeia *"aviso que se aprende a ignorar"* como risco, e um
     * reenvio que tenta para sempre produz exatamente isso do outro lado.
     */
    log?.warn(
      {
        tag: "tracker-mark-failed",
        taskId,
        mark,
        message: error instanceof Error ? error.message : String(error),
      },
      "não deu para comentar no tracker",
    );
    return false;
  }
}

/**
 * O mapa de colunas, e ele mora no repositório
 * ([Q65](../../../../docs/features/028-autonomous-orchestration/open-questions.md)).
 *
 * **Sem mapa, nada é movido lá** — e isso é a decisão, não o default preguiçoso.
 * Mover estado no tracker de alguém sem um mapa que essa pessoa escreveu é a
 * definição de duas fontes de verdade brigando, que o §8 nomeia como risco.
 */
export type ColumnMap = Readonly<Record<string, string>>;

export async function moveState(
  { db, host, log }: MarkDeps,
  taskId: string,
  map: ColumnMap | null,
): Promise<boolean> {
  if (!host.available() || map === null) return false;

  const row = await db.query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row?.externalId || row.externalSource !== host.id) return false;

  // Uma coluna que o mapa não nomeia **não** é movida. O mapa é explícito por
  // definição: o que não está nele é o que você decidiu não espelhar.
  const stateId = map[row.status];
  if (stateId === undefined) return false;

  try {
    await host.moveState(row.externalId, stateId);
    return true;
  } catch (error) {
    log?.warn(
      {
        tag: "tracker-move-failed",
        taskId,
        status: row.status,
        message: error instanceof Error ? error.message : String(error),
      },
      "não deu para mover o estado no tracker",
    );
    return false;
  }
}
