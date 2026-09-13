import { eq, inArray } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { session } from "../db/schema.js";
import type { AcpRateLimit } from "@lumem/shared";

import type { BoardColumn } from "./board.js";
import { pausedUntil } from "./pause.js";

/**
 * O selo do cartão (`028-autonomous-orchestration` §4.1, T7).
 *
 * **Derivado, nunca guardado.** É a defesa que o §4.1 escreve para ele: *"ele
 * **não pode** divergir da realidade, como uma coluna guardada pode"*. Matar a
 * sessão do revisor faz o selo voltar na leitura seguinte, **sem nenhuma
 * escrita** — e é isso que o teste prova.
 *
 * São cinco estados, e o desenho de 2026-09-11 acrescentou o primeiro (§10.2):
 * sem `manual — ninguém pega`, um quadro com a autonomia desligada desenharia o
 * mesmo pixel de uma esteira travada. Ele é o **default do produto**.
 *
 * **O selo guarda o verbo e devolve o substantivo.** `revisando há 2 min`, não
 * `revisor trabalhando há 2 min`, que não cabe nos 151px medidos da caixa — e o
 * papel já está escrito no cabeçalho da coluna. Esperando, o substantivo volta,
 * aí ele não é redundante: é o que falta.
 */

export type SealRole = "implementador" | "revisor" | "testador";

export type Seal =
  /** Ninguém pega. O **default**, e o que a F1 desenha quase sempre. */
  | { kind: "manual" }
  /** A etapa é devida e não tem trabalhador. Precisa da esteira (F2). */
  | { kind: "waiting"; role: SealRole }
  /** Alguém está num turno, agora. `role` é `null` numa coluna sem papel. */
  | { kind: "working"; role: SealRole | null; since: Date }
  /** Travada, com o motivo em uma frase (F3/F4). */
  | { kind: "blocked"; reason: string }
  /** Cota do agente, não orçamento: retoma sozinha (F3, Q32). */
  | { kind: "paused"; until: Date };

/**
 * O papel de cada coluna — e só as três etapas da máquina têm um.
 *
 * `backlog`, `open`, `ready_to_merge` e `done` não têm porque ninguém *deveria*
 * estar trabalhando nelas. Quando alguém está — você assumiu o volante num
 * cartão em `ready_to_merge` —, o selo diz `working` com `role: null`, que é o
 * genérico dos três verbos. Inventar um quarto papel para cobrir isso seria
 * inventar um quarto encaixe, e o §6 tirou isso de escopo de propósito.
 */
const ROLE_OF: Partial<Record<BoardColumn, SealRole>> = {
  in_progress: "implementador",
  review: "revisor",
  testing: "testador",
};

export interface SealFacts {
  status: BoardColumn;
  /** Turnos em voo nas sessões desta tarefa. Vazio é o caso comum. */
  liveTurns: readonly { startedAt: Date }[];
  /**
   * Até quando a cota do agente está fechada, ou `null` (T17).
   *
   * Vem antes do turno em voo na ordem de decisão, e isso é a Q32: uma tarefa
   * pausada **liberou a vaga** — não há ninguém trabalhando nela, e dizer
   * `implementando há 12 min` de algo que está esperando a cota reabrir seria o
   * selo mentindo sobre quem está com ela.
   */
  pausedUntil?: Date | null;
}

/**
 * Função pura, e é o que torna os cinco estados testáveis sem subir agente.
 *
 * A alternativa — o selo lendo o `AcpManager` de dentro — faria todo caso de
 * teste precisar de um processo, e nenhum dos cinco é sobre processo.
 */
export function sealOf({ status, liveTurns, pausedUntil }: SealFacts): Seal {
  // Antes do turno: cota é espera, e quem espera não está trabalhando.
  if (pausedUntil) return { kind: "paused", until: pausedUntil };
  if (liveTurns.length === 0) return { kind: "manual" };

  // O mais antigo: o cartão pergunta *há quanto tempo alguém está nisto*, e com
  // duas sessões na mesma tarefa a resposta honesta é desde quando a primeira
  // começou — não desde a última, que faria o relógio andar para trás.
  const since = liveTurns.reduce(
    (oldest, turn) => (turn.startedAt < oldest ? turn.startedAt : oldest),
    liveTurns[0]!.startedAt,
  );
  return { kind: "working", role: ROLE_OF[status] ?? null, since };
}

/**
 * Os turnos em voo, por tarefa.
 *
 * Uma consulta para o quadro inteiro, e não uma por cartão: `liveTurns()` já
 * devolve tudo que está no ar — o que falta é saber de qual tarefa cada sessão
 * é, e isso é uma leitura só.
 */
export function liveTurnsByTask(
  db: Db,
  liveTurns: readonly { sessionId: string; startedAt: Date }[],
): Map<string, { startedAt: Date }[]> {
  const byTask = new Map<string, { startedAt: Date }[]>();
  if (liveTurns.length === 0) return byTask;

  const rows = db
    .select({ id: session.id, taskId: session.taskId })
    .from(session)
    .where(
      inArray(
        session.id,
        liveTurns.map((turn) => turn.sessionId),
      ),
    )
    .all();

  const taskOf = new Map(rows.map((row) => [row.id, row.taskId]));
  for (const turn of liveTurns) {
    const taskId = taskOf.get(turn.sessionId);
    // Sessão sem tarefa é o caso comum do produto — um shell, uma conversa
    // solta. Ela não pinta selo em cartão nenhum.
    if (!taskId) continue;
    byTask.set(taskId, [...(byTask.get(taskId) ?? []), { startedAt: turn.startedAt }]);
  }
  return byTask;
}

/**
 * A cota de cada tarefa, pela sessão que a relatou (`028` Parte 3, T17).
 *
 * Mesma forma do `liveTurnsByTask`, e uma consulta só para o quadro inteiro.
 * Quando duas sessões da mesma tarefa relatam cota, vence a que reabre **mais
 * tarde**: dizer que reabre às 18h quando a outra só reabre às 19h faria o
 * cartão prometer uma volta que não acontece.
 */
export function pausesByTask(
  db: Db,
  rateLimits: readonly { sessionId: string; rateLimit: AcpRateLimit }[],
): Map<string, Date> {
  const byTask = new Map<string, Date>();
  if (rateLimits.length === 0) return byTask;

  const rows = db
    .select({ id: session.id, taskId: session.taskId })
    .from(session)
    .where(
      inArray(
        session.id,
        rateLimits.map((one) => one.sessionId),
      ),
    )
    .all();

  const taskOf = new Map(rows.map((row) => [row.id, row.taskId]));
  for (const one of rateLimits) {
    const taskId = taskOf.get(one.sessionId);
    if (!taskId) continue;
    const until = pausedUntil(one.rateLimit);
    if (until === null) continue;
    const known = byTask.get(taskId);
    if (known === undefined || until > known) byTask.set(taskId, until);
  }
  return byTask;
}

/** Existe para o teste de que o selo some sem ninguém escrever. */
export function sessionsOfTask(db: Db, taskId: string): string[] {
  return db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.taskId, taskId))
    .all()
    .map((row) => row.id);
}
