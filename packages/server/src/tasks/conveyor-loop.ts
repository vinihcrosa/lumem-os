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
   * Uma passada por vez, **por workspace**.
   *
   * Sem a trava, uma passada lenta — `setup` de um projeto grande — seria
   * alcançada pela seguinte, e as duas leriam a **mesma** fila: o cartão ainda
   * não tem turno em voo, então as duas o pegariam e abririam duas sessões para
   * a mesma tarefa. É o único lugar em que o *"um escritor só"* do ADR precisa
   * de ajuda, e a ajuda é este conjunto — não um lease.
   *
   * **Por workspace, e não um booleano do daemon inteiro**: com um sinalizador
   * só, um turno pendurado num workspace segurava a passada de todos os outros
   * por até os 30 minutos inteiros do teto — a esteira parava por causa de um
   * cartão, e o sintoma era *"parou de andar"* sem nada na tela. O escopo do
   * teto de paralelismo é o workspace desde a `queueOf`; o do relógio passa a
   * ser o mesmo.
   */
  const running = new Set<string>();

  const timer = schedule(() => {
    void (async () => {
      try {
        /*
         * Todos os workspaces, e não *"o que está aberto na tela"*: a esteira
         * roda no daemon, e o daemon não sabe o que o browser está mostrando —
         * nem deve, porque fechar a janela não pode parar o trabalho.
         */
        const spaces = await db.select({ id: workspace.id }).from(workspace);
        /*
         * Concorrentes, e cada um com o **próprio** `catch`.
         *
         * Em série, um workspace cujo repositório foi movido lançava antes dos
         * seguintes e a passada acabava ali — os outros nem eram lidos. O
         * comentário do `catch` abaixo já dizia que era isso que ele existia
         * para evitar, e ele só cobria a passada, não o laço.
         */
        await Promise.all(
          spaces
            .filter((space) => !running.has(space.id))
            .map(async (space) => {
              running.add(space.id);
              try {
                await conveyor.tick(space.id);
              } catch (error) {
                report(error);
              } finally {
                running.delete(space.id);
              }
            }),
        );
      } catch (error) {
        // O que sobra: ler a lista de workspaces falhou. As passadas já têm o
        // `catch` delas lá em cima, uma por uma.
        report(error);
      }
    })();
  }, intervalMs);

  /**
   * O retrato de uma falha, com etiqueta procurável — como o `turn-failed`.
   *
   * **A mensagem, e não o objeto.** A primeira versão logava `{ error }` e o
   * pino serializava um `DomainError` como `{"code":"BLOCKED","name":"DomainError"}`
   * — sem a frase, que é a única parte que diz o que aconteceu. É o mesmo
   * defeito que o retrato do turno pagou: uma etiqueta procurável que não
   * carrega o que se procura.
   */
  function report(error: unknown): void {
    log?.warn(
      {
        tag: "conveyor-tick-failed",
        message: error instanceof Error ? error.message : String(error),
        code: (error as { code?: unknown }).code ?? null,
      },
      "a passada da esteira falhou",
    );
  }

  // `unref` para o laço não segurar o processo: um daemon que já recebeu o
  // sinal de parada não pode ficar vivo por causa de um relógio de 15s.
  timer.unref?.();

  return () => {
    cancel(timer);
  };
}
