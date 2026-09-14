import { newId } from "@lumem/shared";
import { and, asc, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { taskFinding, type TaskFindingRow } from "../db/schema.js";
import { DomainError } from "../errors.js";

/**
 * O que o revisor achou (`028` Parte 7 — T53).
 *
 * **O parecer só existe para a máquina se ela souber lê-lo**, e até esta parte
 * ela não sabia: o texto do turno não era lido por nada. O revisor escreveu
 * `Reprovo`, com mutante e cenário, e o daemon registrou `portão verde`.
 *
 * A [Q67](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * decidiu **dois baldes**, e o que os separa não é a verdade do achado — é quem
 * consegue resolver a discussão. `blocks` a máquina resolve, rerodando; `notes`
 * uma pessoa resolve, na PR.
 */

export type FindingBucket = "blocks" | "notes";
export type FindingVerification = "pending" | "reproduced" | "refuted" | "skipped";

export interface RecordFindingInput {
  taskId: string;
  foundBySession: string;
  role: string;
  bucket: FindingBucket;
  title: string;
  detail?: string;
  /** Obrigatório em `blocks`, recusado em `notes`. É o que torna o balde honesto. */
  command?: string;
  expected?: string;
}

export interface TaskFindingRepository {
  /** Grava o que o revisor postou nesta volta. */
  record(input: RecordFindingInput): Promise<TaskFindingRow>;
  /** O que esta sessão achou neste turno, em ordem. */
  bySession(sessionId: string): Promise<TaskFindingRow[]>;
  /** O que ainda segura o cartão desta tarefa. */
  blocking(taskId: string): Promise<TaskFindingRow[]>;
  /** Tudo desta tarefa, para a tela e para a PR. */
  byTask(taskId: string): Promise<TaskFindingRow[]>;
  /** O veredito da reprodução, escrito pelo daemon. */
  verify(id: string, verification: FindingVerification, output: string): Promise<void>;
  /**
   * O que o implementador já consertou deixa de segurar.
   *
   * Chamado quando a etapa anda: um achado é sobre **aquela** passada, e mantê-lo
   * de pé depois faria o cartão carregar para sempre o primeiro `Reprovo`.
   */
  clear(taskId: string): Promise<void>;
}

export function createTaskFindingRepository(db: Db): TaskFindingRepository {
  return {
    async record(input) {
      /*
       * A regra dos dois baldes é cobrada **aqui e no `CHECK`**, e a duplicação
       * se paga: o banco recusa com uma frase que fala de constraint, e o agente
       * do outro lado precisa de uma que diga o que fazer.
       */
      if (input.bucket === "blocks" && (input.command ?? "").trim() === "") {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "um achado que bloqueia precisa do comando que o demonstra — sem ele, use o balde `notes`",
        );
      }
      if (input.bucket === "notes" && input.command !== undefined) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "`notes` não leva comando: um achado com reprodução pertence ao balde `blocks`",
        );
      }

      const [row] = await db
        .insert(taskFinding)
        .values({
          id: newId(),
          taskId: input.taskId,
          foundBySession: input.foundBySession,
          role: input.role,
          bucket: input.bucket,
          title: input.title,
          detail: input.detail ?? "",
          command: input.bucket === "blocks" ? (input.command ?? null) : null,
          expected: input.expected ?? null,
        })
        .returning();
      return row!;
    },

    bySession(sessionId) {
      return db
        .select()
        .from(taskFinding)
        .where(eq(taskFinding.foundBySession, sessionId))
        .orderBy(asc(taskFinding.createdAt));
    },

    /*
     * `reproduced` **e** `pending`, e o `pending` não é descuido.
     *
     * Um achado que o daemon ainda não conseguiu rerodar — o comando estourou o
     * teto, o checkout sumiu — não vira aprovação por omissão. Ele segura, e a
     * frase no cartão diz que segura por não ter sido verificado.
     */
    blocking(taskId) {
      return db
        .select()
        .from(taskFinding)
        .where(and(eq(taskFinding.taskId, taskId), eq(taskFinding.bucket, "blocks")))
        .orderBy(asc(taskFinding.createdAt))
        .then((rows) => rows.filter((row) => row.verification !== "refuted"));
    },

    byTask(taskId) {
      return db
        .select()
        .from(taskFinding)
        .where(eq(taskFinding.taskId, taskId))
        .orderBy(asc(taskFinding.createdAt));
    },

    async verify(id, verification, output) {
      await db
        .update(taskFinding)
        .set({
          verification,
          // Truncado: a saída de um `pnpm test` inteiro não cabe num cartão, e o
          // que faz alguém discordar está nas primeiras linhas.
          output: output.slice(0, 4000),
          updatedAt: new Date(),
        })
        .where(eq(taskFinding.id, id));
    },

    async clear(taskId) {
      await db.delete(taskFinding).where(eq(taskFinding.taskId, taskId));
    },
  };
}
