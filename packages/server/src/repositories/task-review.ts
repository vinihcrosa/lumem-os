import { newId } from "@lumem/shared";
import { and, desc, eq, gte } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { taskReview, type TaskReviewRow } from "../db/schema.js";

/**
 * O recibo de que uma revisão aconteceu (`028` Parte 7).
 *
 * **O achado não consegue dizer *"olhei e não achei nada"*.** Um parecer vazio
 * não grava linha nenhuma em `task_finding`, e sem recibo o portão lia isso como
 * *"o revisor não deixou parecer"* — o oposto do que aconteceu. O cartão ficava
 * em `In Review` para sempre **porque o revisor acertou**, que é o pior modo de
 * falha que esta parte podia ter: ele pune exatamente o comportamento que a
 * [Q67](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * existe para tornar possível.
 *
 * O parecer é o **evento**; os achados são o conteúdo dele.
 */

export interface RecordReviewInput {
  taskId: string;
  bySession: string;
  role: string;
  blocks: number;
  notes: number;
}

export interface TaskReviewRepository {
  /** Grava que esta sessão entregou parecer, com o tamanho dele. */
  record(input: RecordReviewInput): Promise<TaskReviewRow>;
  /**
   * O parecer que esta sessão entregou **nesta volta**, ou `undefined`.
   *
   * `since` pelo mesmo motivo do achado: desde a T57 a conversa do revisor é uma
   * só por tarefa, e ela atravessa as voltas.
   */
  latest(sessionId: string, since: Date): Promise<TaskReviewRow | undefined>;
  /** Todos os pareceres desta tarefa, para a tela e para quem for ler depois. */
  byTask(taskId: string): Promise<TaskReviewRow[]>;
}

export function createTaskReviewRepository(db: Db): TaskReviewRepository {
  return {
    async record(input) {
      const [row] = await db
        .insert(taskReview)
        .values({
          id: newId(),
          taskId: input.taskId,
          bySession: input.bySession,
          role: input.role,
          blocks: input.blocks,
          notes: input.notes,
        })
        .returning();
      return row!;
    },

    latest(sessionId, since) {
      return db
        .select()
        .from(taskReview)
        .where(and(eq(taskReview.bySession, sessionId), gte(taskReview.createdAt, since)))
        .orderBy(desc(taskReview.createdAt))
        .limit(1)
        .then((rows) => rows[0]);
    },

    byTask(taskId) {
      return db
        .select()
        .from(taskReview)
        .where(eq(taskReview.taskId, taskId))
        .orderBy(desc(taskReview.createdAt));
    },
  };
}
