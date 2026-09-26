import { and, asc, eq, inArray } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { task, workspace, type TaskRow } from "../db/schema.js";
import type { Role } from "../agents/catalog.js";

import type { BoardStatus } from "./board.js";
import { liveTurnsByTask } from "./seal.js";

/**
 * A fila da esteira (`028` §4.1 e §4.3, Parte 2 — T24 e T25).
 *
 * **Uma regra, nenhum caso especial**, e ela é a frase do §4.1: *todo cartão
 * cuja etapa é devida e que não tem trabalhador* — mais a condição que a
 * [Q40](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * acrescentou, *e cuja autonomia está ligada*. A Q40 é explícita sobre isso não
 * ser exceção: a autonomia por tarefa é **condição** da fila, do mesmo jeito que
 * o teto e o orçamento são.
 *
 * **E ela é uma leitura, não um estado.** É o
 * [ADR da esteira sem lease](../../../../docs/adr/2026-09-13-0412-the-conveyor-has-no-lease.md):
 * não existe nada guardado dizendo *"esta está na fila"*, então uma sessão que
 * morreu devolve o cartão **na leitura seguinte**, sem escrita e sem varredor.
 */

/**
 * As quatro etapas devidas, **da direita para a esquerda**.
 *
 * A ordem é a regra do §4.1 — *"terminar vale mais que começar"* —, e é por isso
 * que ela é um array e não um `ORDER BY` com `CASE`: quem lê o array lê a
 * política, e reordenar é reordenar a política.
 *
 * O que **não** está aqui diz tanto quanto o que está. `backlog` é o que ainda
 * não foi autorizado, e a coluna existe para marcar essa fronteira; `ready_to_merge`
 * é sua vez, e o §4.1 a criou justamente para a fila não pegar de volta o que
 * já foi aprovado; `done` acabou.
 */
export const DUE_STAGES: readonly { status: BoardStatus; role: Role }[] = [
  { status: "testing", role: "testador" },
  { status: "review", role: "revisor" },
  { status: "in_progress", role: "implementador" },
  { status: "open", role: "implementador" },
];

/** O interruptor do workspace (§6, Parte 2). Nasce em `manual`. */
export type Autonomy = "manual" | "assistido" | "autonomo";

export interface QueueEntry {
  task: TaskRow;
  /** Qual encaixe esta etapa pede. O prompt e o agente saem daqui. */
  role: Role;
}

export interface QueueFacts {
  /** Quantas vagas há **agora**: teto menos turnos em voo. Nunca negativo. */
  slots: number;
  /** O interruptor do workspace, como está. */
  autonomy: Autonomy;
  /** Em ordem de atendimento. Pode ser maior que `slots` — quem corta é quem chama. */
  entries: QueueEntry[];
}

/**
 * Quantas vagas há agora.
 *
 * **Conta turno em voo, não processo vivo**, e é a mesma derivação do selo pelo
 * mesmo motivo medido: 7 dos 15 transcripts deste repositório **nunca receberam
 * um prompt**. Contá-los como vaga ocupada travaria a fila com sessões que não
 * estão fazendo nada — e é o mesmo erro que o selo evitou ao não usar *"processo
 * de pé"* como critério.
 */
export function slotsOf({ ceiling, turnsInFlight }: { ceiling: number; turnsInFlight: number }): number {
  return Math.max(0, ceiling - turnsInFlight);
}

/**
 * A fila deste workspace, agora.
 *
 * Devolve **a fila inteira** em ordem, e não só o que cabe nas vagas. Cortar
 * aqui misturaria duas perguntas — *o que está devido* e *quanto cabe* —, e a
 * tela precisa da primeira para dizer quantos estão esperando vaga.
 */
export function queueOf(
  db: Db,
  {
    workspaceId,
    liveTurns,
  }: {
    workspaceId: string;
    /** Os turnos em voo do daemon, como o `AcpManager` os relata. */
    liveTurns: readonly { sessionId: string; startedAt: Date }[];
  },
): QueueFacts {
  const space = db.select().from(workspace).where(eq(workspace.id, workspaceId)).get();
  if (space === undefined) return { slots: 0, autonomy: "manual", entries: [] };

  const autonomy = space.autonomy as Autonomy;
  const busy = liveTurnsByTask(db, liveTurns);

  /*
   * Quantos turnos em voo são **deste** workspace.
   *
   * `liveTurns.length` seria o daemon inteiro, e aí um workspace ocupado
   * fecharia a fila de outro — o teto é do workspace, e a folha do Open Design
   * o desenha ao lado do quadro (`autônomo · teto 2 · 2 em uso`), que é uma
   * tela de um workspace só.
   *
   * E conta **inclusive o cartão que você assumiu**, cuja autonomia está
   * desligada. Parece contraditório e não é: o teto responde *quanto está
   * acontecendo agora aqui*, não *quantas sessões a esteira abriu*. Se ele
   * ignorasse o que você está conduzindo, ligar a autonomia com duas conversas
   * suas abertas subiria para quatro coisas em voo num teto de dois.
   */
  const busyHere =
    busy.size === 0
      ? 0
      : db
          .select({ id: task.id })
          .from(task)
          .where(and(eq(task.workspaceId, workspaceId), inArray(task.id, [...busy.keys()])))
          .all()
          .reduce((total, row) => total + (busy.get(row.id)?.length ?? 0), 0);

  /*
   * Uma consulta para as quatro etapas, e a ordem vem do array em memória.
   *
   * Quatro viagens dariam a mesma resposta e abririam a mesma janela que o
   * quadro fechou na T6: nenhuma veria as outras, e um cartão que mudasse de
   * coluna no meio apareceria duas vezes ou nenhuma — aqui isso seria **duas
   * sessões para a mesma tarefa**.
   */
  const rows = db
    .select()
    .from(task)
    .where(
      and(
        eq(task.workspaceId, workspaceId),
        inArray(
          task.status,
          DUE_STAGES.map((stage) => stage.status),
        ),
        // A condição da Q40, e ela é da consulta e não do laço: um cartão que
        // você assumiu não deve nem ser lido como candidato.
        eq(task.autonomy, "inherit"),
      ),
    )
    .orderBy(asc(task.position))
    .all();

  const entries: QueueEntry[] = [];
  for (const stage of DUE_STAGES) {
    for (const row of rows) {
      if (row.status !== stage.status) continue;
      // *"que não tem trabalhador"*, e trabalhador é turno em voo. Um cartão
      // cuja sessão morreu volta a ser candidato aqui, sem escrita nenhuma —
      // que é a recuperação inteira da esteira.
      if ((busy.get(row.id) ?? []).length > 0) continue;
      entries.push({ task: row, role: stage.role });
    }
  }

  return {
    slots: slotsOf({ ceiling: space.autonomyMaxParallel, turnsInFlight: busyHere }),
    autonomy,
    entries,
  };
}
