import { eq, inArray } from "drizzle-orm";

import type { AcpRateLimit, Seal, SealRole } from "@lumem/shared";

import type { Db } from "../db/index.js";
import { session } from "../db/schema.js";

import type { BoardStatus } from "./board.js";
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
 *
 * `Seal` e `SealRole` moram em `@lumem/shared` (`032` T9): `since`/`until`
 * chegam aqui como `Date` (é o que o turno em voo e a cota carregam) e saem
 * como `string` — a fronteira que o `shared` descreve é a serializada.
 */

/**
 * O papel de cada coluna — e só as três etapas da máquina têm um.
 *
 * `backlog`, `open`, `ready_to_merge` e `done` não têm porque ninguém *deveria*
 * estar trabalhando nelas. Quando alguém está — você assumiu o volante num
 * cartão em `ready_to_merge` —, o selo diz `working` com `role: null`, que é o
 * genérico dos três verbos. Inventar um quarto papel para cobrir isso seria
 * inventar um quarto encaixe, e o §6 tirou isso de escopo de propósito.
 */
const ROLE_OF: Partial<Record<BoardStatus, SealRole>> = {
  in_progress: "implementador",
  review: "revisor",
  testing: "testador",
};

export interface SealFacts {
  status: BoardStatus;
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
  /**
   * Por que a esteira parou aqui, ou `null` (`028` Parte 2, T28).
   *
   * **É o único fato guardado que este arquivo lê**, e o comentário da coluna
   * diz por quê: os outros quatro estados saem de coisas que continuam
   * existindo — turno em voo, cota relatada, coluna —, e o bloqueio é o registro
   * de uma **decisão** que não está em lugar nenhum depois do processo.
   */
  blockedReason?: string | null;
  /**
   * A esteira pode pegar esta tarefa (`028` Parte 2, T31).
   *
   * É o que separa `aguardando revisor` de `manual — ninguém pega`, e a
   * diferença é a feature inteira: o primeiro diz *"a máquina vem"*, e o segundo
   * diz *"não vem"*. Sem este campo, um quadro com a autonomia ligada
   * desenhava o mesmo pixel de um quadro com ela desligada — que é exatamente o
   * defeito que o §10.2 nomeou ao inventar o `manual`.
   */
  autonomyOn?: boolean;
}

/**
 * Função pura, e é o que torna os cinco estados testáveis sem subir agente.
 *
 * A alternativa — o selo lendo o `AcpManager` de dentro — faria todo caso de
 * teste precisar de um processo, e nenhum dos cinco é sobre processo.
 */
export function sealOf({
  status,
  liveTurns,
  pausedUntil,
  blockedReason = null,
  autonomyOn = false,
}: SealFacts): Seal {
  /*
   * O bloqueio vem primeiro, **inclusive antes da cota**.
   *
   * Os dois dizem *"parou"*, e a diferença é quem retoma: a cota volta sozinha
   * e o bloqueio espera você. Um cartão bloqueado que pintasse `pausada até
   * ~04:20` prometeria uma retomada que não vai acontecer — e o relógio da
   * pausa existe justamente para dizer que não precisa fazer nada.
   */
  if (blockedReason !== null && blockedReason !== "") {
    return { kind: "blocked", reason: blockedReason };
  }
  // Antes do turno: cota é espera, e quem espera não está trabalhando.
  if (pausedUntil) return { kind: "paused", until: pausedUntil.toISOString() };
  if (liveTurns.length === 0) {
    /*
     * Ninguém está trabalhando. As duas leituras são opostas e a tela precisa
     * distingui-las: com a esteira ligada e esta etapa tendo papel, **a máquina
     * vem** — é `aguardando <papel>`; sem, ninguém vem, e é `manual`.
     */
    const role = ROLE_OF[status];
    if (autonomyOn && role !== undefined) return { kind: "waiting", role };
    return { kind: "manual" };
  }

  // O mais antigo: o cartão pergunta *há quanto tempo alguém está nisto*, e com
  // duas sessões na mesma tarefa a resposta honesta é desde quando a primeira
  // começou — não desde a última, que faria o relógio andar para trás.
  const since = liveTurns.reduce(
    (oldest, turn) => (turn.startedAt < oldest ? turn.startedAt : oldest),
    liveTurns[0]!.startedAt,
  );
  return { kind: "working", role: ROLE_OF[status] ?? null, since: since.toISOString() };
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
