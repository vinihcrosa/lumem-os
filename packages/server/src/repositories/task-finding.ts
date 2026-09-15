import { newId } from "@lumem/shared";
import { and, asc, eq, gte } from "drizzle-orm";

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
  /**
   * O que esta sessão postou **nesta volta**, em ordem.
   *
   * `since` é o instante em que o turno começou, e ele não é zelo: desde a T57
   * a conversa do revisor é **uma só** por tarefa, e ela atravessa as voltas. Só
   * pela sessão, a segunda revisão releria o parecer da primeira — rerodaria
   * comandos já julgados, republicaria as mesmas anotações na PR, e, pior, um
   * revisor que não postasse nada na volta 2 passaria por *"entregou parecer"*
   * por causa do que ele disse na volta 1.
   */
  bySession(sessionId: string, since: Date): Promise<TaskFindingRow[]>;
  /** O que ainda segura o cartão desta tarefa. */
  blocking(taskId: string): Promise<TaskFindingRow[]>;
  /**
   * O que segura, **entregue ao implementador** (`028` Parte 7).
   *
   * Lê e marca `skipped` na mesma chamada, e a marca é o que impede o achado da
   * volta 1 de reaparecer no prompt da volta 2 — já consertado, e ainda assim
   * escrito como *"conserte e commite"*. Ele não se perde: o cartão volta ao
   * revisor inteiro, e um achado que sobreviveu ao conserto é achado de novo.
   */
  handOver(taskId: string): Promise<TaskFindingRow[]>;
  /** Tudo desta tarefa, para a tela e para a PR. */
  byTask(taskId: string): Promise<TaskFindingRow[]>;
  /** O veredito da reprodução, escrito pelo daemon. */
  verify(id: string, verification: FindingVerification, output: string): Promise<void>;
}

export function createTaskFindingRepository(db: Db): TaskFindingRepository {
  /*
   * `reproduced` **e** `pending`, e o `pending` não é descuido.
   *
   * Um achado que o daemon ainda não conseguiu rerodar — o comando estourou o
   * teto, o checkout sumiu — não vira aprovação por omissão. Ele segura, e a
   * frase no cartão diz que segura por não ter sido verificado.
   */
  function blocking(taskId: string): Promise<TaskFindingRow[]> {
    return db
      .select()
      .from(taskFinding)
      .where(and(eq(taskFinding.taskId, taskId), eq(taskFinding.bucket, "blocks")))
      .orderBy(asc(taskFinding.createdAt))
      .then((rows) => rows.filter((row) => row.verification !== "refuted"));
  }

  return {
    blocking,

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

    bySession(sessionId, since) {
      return db
        .select()
        .from(taskFinding)
        .where(
          and(
            eq(taskFinding.foundBySession, sessionId),
            gte(taskFinding.createdAt, since),
          ),
        )
        .orderBy(asc(taskFinding.createdAt));
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

    async handOver(taskId) {
      const open = await blocking(taskId);
      const going = open.filter((one) => one.verification === "reproduced");
      for (const one of going) {
        /*
         * `skipped`, e não apagado: o que o revisor afirmou fica na tabela — é
         * o rastro de quem afirma o que se sustenta e de quem não. O que a
         * marca diz é *"já foi devolvido"*, e nada além disso.
         */
        await db
          .update(taskFinding)
          .set({ verification: "skipped", updatedAt: new Date() })
          .where(eq(taskFinding.id, one.id));
      }
      return going;
    },
  };
}
