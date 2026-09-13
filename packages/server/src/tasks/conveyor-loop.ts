import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import { workspace } from "../db/schema.js";

import type { Conveyor } from "./conveyor.js";

/**
 * O que faz a esteira andar sem ninguém pedir (`028` §6, Parte 2).
 *
 * **Um relógio, e não um evento**, e a escolha tem motivo: a fila é uma
 * *leitura* ([ADR](../../../../docs/adr/2026-09-13-0412-the-conveyor-has-no-lease.md)),
 * então o que a muda são coisas que acontecem em lugares diferentes — um turno
 * que acabou, um cartão arrastado, um teto alterado, um daemon que reiniciou.
 * Acordar em cada uma delas seria assinar quatro eventos e ainda perder o quinto;
 * reler de tempos em tempos custa uma consulta e **não tem caso esquecido**.
 *
 * É o mesmo desenho do `PrCache` da [`013`](../../../../docs/features/013-pull-request-status/prd.md),
 * que se pergunta sozinho de 15 em 15 segundos, e o custo aqui é menor: a
 * consulta é local, contra SQLite, sem processo nenhum.
 */

/**
 * De quanto em quanto.
 *
 * **15 segundos**, o mesmo do `PrCache`, e por simetria e não por medida: o que
 * este número controla é a latência entre *"o turno acabou"* e *"o próximo
 * começou"*, que numa tarefa de minutos é ruído. Baixá-lo não acelera trabalho
 * nenhum — só lê o banco mais vezes.
 */
export const CONVEYOR_INTERVAL_MS = 15_000;

export interface ConveyorLoopOptions {
  db: Db;
  conveyor: Conveyor;
  intervalMs?: number;
  log?: Pick<FastifyBaseLogger, "warn">;
  /** Injetável para o teste não depender do relógio real. */
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

/** Devolve como parar. Igual ao `trackSessionUsage` e ao `trackTaskProgress`. */
export function runConveyorLoop({
  db,
  conveyor,
  intervalMs = CONVEYOR_INTERVAL_MS,
  log,
  setInterval: schedule = globalThis.setInterval,
  clearInterval: cancel = globalThis.clearInterval,
}: ConveyorLoopOptions): () => void {
  /*
   * Uma passada por vez.
   *
   * Sem esta trava, uma passada lenta — `setup` de um projeto grande — seria
   * alcançada pela seguinte, e as duas leriam a **mesma** fila: o cartão ainda
   * não tem turno em voo, então as duas o pegariam e abririam duas sessões para
   * a mesma tarefa. É o único lugar em que o *"um escritor só"* do ADR precisa
   * de ajuda, e a ajuda é um booleano — não um lease.
   */
  let running = false;

  const timer = schedule(() => {
    if (running) return;
    running = true;

    void (async () => {
      try {
        /*
         * Todos os workspaces, e não *"o que está aberto na tela"*: a esteira
         * roda no daemon, e o daemon não sabe o que o browser está mostrando —
         * nem deve, porque fechar a janela não pode parar o trabalho.
         */
        const spaces = await db.select({ id: workspace.id }).from(workspace);
        for (const space of spaces) {
          await conveyor.tick(space.id);
        }
      } catch (error) {
        /*
         * Uma passada que falha **não** derruba o laço, e não é zelo: sem isto,
         * um projeto com o repositório movido pararia a esteira de todos os
         * outros workspaces, e o sintoma seria *"parou de andar"* sem nada na
         * tela. O retrato vai para o log com etiqueta procurável, como o
         * `turn-failed`.
         */
        /*
         * A **mensagem**, e não o objeto.
         *
         * A primeira versão logava `{ error }` e o pino serializava um
         * `DomainError` como `{"code":"BLOCKED","name":"DomainError"}` — sem a
         * frase, que é a única parte que diz o que aconteceu. É o mesmo defeito
         * que o retrato do turno pagou: uma etiqueta procurável que não carrega
         * o que se procura.
         */
        log?.warn(
          {
            tag: "conveyor-tick-failed",
            message: error instanceof Error ? error.message : String(error),
            code: (error as { code?: unknown }).code ?? null,
          },
          "a passada da esteira falhou",
        );
      } finally {
        running = false;
      }
    })();
  }, intervalMs);

  // `unref` para o laço não segurar o processo: um daemon que já recebeu o
  // sinal de parada não pode ficar vivo por causa de um relógio de 15s.
  timer.unref?.();

  return () => {
    cancel(timer);
  };
}
