import { newId } from "@lumem/shared";
import { asc, eq, sql } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { task, taskComment, type TaskCommentRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints } from "./base.js";

/**
 * O que foi dito sobre uma tarefa (`028` Parte 2, T21).
 *
 * Duas frases governam este arquivo, e as duas vêm de perguntas respondidas:
 *
 * - **não passa pelo portão da inbox** ([Q50](../../../../docs/features/028-autonomous-orchestration/open-questions.md)).
 *   O portão da `022` é sobre **criar tarefa** — o agente escrevendo no plano de
 *   quem conduz. Um comentário na tarefa que o daemon deu a ele é **lateral**, e
 *   tratá-lo como proposta encheria a inbox de dezenas de resumos por manhã, que
 *   é como se aprende a esvaziar a inbox sem ler;
 * - **a proveniência é o que sobra da regra.** Quem escreveu vem junto, e o
 *   `CHECK` do schema fecha os dois sentidos: agente sem sessão não tem
 *   proveniência, e pessoa com sessão é mentira sobre quem escreveu.
 */

export interface CreateTaskCommentInput {
  taskId: string;
  body: string;
  /** `human` é o default, e aí `sessionId` **não** pode vir. */
  actor?: "human" | "agent";
  sessionId?: string;
}

export interface TaskCommentRepository {
  create(input: CreateTaskCommentInput): Promise<TaskCommentRow>;
  listByTask(taskId: string): Promise<TaskCommentRow[]>;
  remove(id: string): Promise<void>;
}

export function createTaskCommentRepository(db: Db): TaskCommentRepository {
  return {
    async create({ taskId, body, actor = "human", sessionId }) {
      const text = body.trim();
      /*
       * Comentário vazio não é comentário: ele viraria uma linha na tarefa que
       * não diz nada e que ninguém consegue distinguir de um erro de envio. O
       * banco não expressa "texto não branco" — `NOT NULL` aceita `''`.
       */
      if (text === "") throw new DomainError("INVALID_ARGUMENT", "o comentário está vazio");

      /*
       * A tarefa existe, lida antes de escrever.
       *
       * O estrangeiro já recusaria, mas com uma mensagem de banco. É a mesma
       * exceção que o `task.ts` abre para o projeto: ou a frase é escrita aqui,
       * ou quem lê recebe `FOREIGN KEY constraint failed`.
       */
      const parent = await db.query.task.findFirst({ where: eq(task.id, taskId) });
      if (!parent) throw new DomainError("NOT_FOUND", `tarefa ${taskId} não existe`);

      const row = {
        id: newId(),
        taskId,
        body: text,
        createdBy: actor,
        createdBySession: actor === "agent" ? (sessionId ?? null) : null,
      };
      /*
       * O `sessionId` de um comentário de pessoa é **descartado**, e não um
       * erro: quem chama pode estar numa sessão e ainda assim estar escrevendo
       * como você. A mentira que o `CHECK` recusa é a coluna preenchida com
       * `createdBy: 'human'`, e é ela que não pode ser possível construir.
       *
       * A sessão **não é verificada** antes de escrever, e isso é coerente com
       * a coluna ser id solto: ela pode legitimamente já não existir quando
       * alguém lê, então exigir que exista na escrita seria uma garantia que
       * dura um instante.
       */
      const [created] = await withConstraints(
        () => db.insert(taskComment).values(row).returning(),
        {
          // Só a tarefa é estrangeira. O ponteiro da sessão é id solto, e o
          // comentário no schema diz por quê — foi um teste vermelho que
          // provou que estrangeiro e `CHECK` se contradizem aqui.
          foreignKey: { code: "NOT_FOUND", message: "a tarefa não existe" },
          "check:task_comment_provenance": {
            code: "INVALID_ARGUMENT",
            message: "comentário de agente precisa da sessão que o escreveu",
          },
        },
      );
      // `returning()` de um `insert` que não lançou sempre traz a linha; a
      // guarda existe porque o tipo não sabe disso, e `!` esconderia a
      // suposição em vez de escrevê-la.
      if (!created) throw new DomainError("CONSTRAINT_VIOLATION", "o comentário não foi criado");
      return created;
    },

    async listByTask(taskId) {
      /*
       * Em ordem de escrita, e o desempate importa.
       *
       * `createdAt` tem resolução de **milissegundo**, e três comentários
       * escritos no mesmo turno caem no mesmo valor com facilidade — a suíte
       * escreve os três em menos de 1ms. Ordenar só por ele deixaria a ordem
       * dos empatados por conta do plano de consulta, o que é um teste que
       * passa até o dia em que não passa.
       *
       * `rowid` desempata porque no SQLite ele é **monotônico por inserção**, e
       * ordenar por `id` não serviria: o `newId` é `randomUUID`, então seria
       * ordenar por acaso com cara de determinismo.
       */
      return db
        .select()
        .from(taskComment)
        .where(eq(taskComment.taskId, taskId))
        .orderBy(asc(taskComment.createdAt), asc(sql`rowid`))
        .all();
    },

    async remove(id) {
      const found = await db.query.taskComment.findFirst({ where: eq(taskComment.id, id) });
      if (!found) throw new DomainError("NOT_FOUND", `comentário ${id} não existe`);
      await db.delete(taskComment).where(eq(taskComment.id, id));
    },
  };
}
