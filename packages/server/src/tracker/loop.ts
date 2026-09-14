import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import { workspace } from "../db/schema.js";

import { firstProjectOf, LUMEM_LABEL, syncTracker } from "./sync.js";
import type { TrackerHost } from "./TrackerHost.js";

/**
 * O relógio do tracker (`028` Parte 5 — Q60).
 *
 * **60 segundos**, e não os 15 do `PrCache` da
 * [`013`](../../../../docs/features/013-pull-request-status/prd.md): aquele
 * responde a uma barra que **você está olhando**, e este alimenta uma fila que
 * anda sozinha. Quatro vezes mais cota por um minuto de latência que ninguém
 * percebe é gastar por nada — e o §3.2 do
 * [estudo](../../../../docs/project/orchestration-measurements.md) mediu os dois:
 * 2,4% da cota a 60 s contra 9,6% a 15 s.
 */
export const TRACKER_INTERVAL_MS = 60_000;

export interface TrackerLoopOptions {
  db: Db;
  host: TrackerHost;
  intervalMs?: number;
  log?: Pick<FastifyBaseLogger, "warn">;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

/** Devolve como parar, como os outros observadores do `bootstrap`. */
export function runTrackerLoop({
  db,
  host,
  intervalMs = TRACKER_INTERVAL_MS,
  log,
  setInterval: schedule = globalThis.setInterval,
  clearInterval: cancel = globalThis.clearInterval,
}: TrackerLoopOptions): () => void {
  // Uma passada por vez, pelo mesmo motivo do laço da esteira: duas leituras
  // simultâneas veriam a mesma issue como inexistente e tentariam criá-la duas
  // vezes — o índice único recusaria a segunda, mas com um erro em vez de um
  // `continue`.
  let running = false;

  const timer = schedule(() => {
    if (running) return;
    running = true;

    void (async () => {
      try {
        // Sem a chave, nem o laço acorda de verdade: é uma leitura de flag e um
        // `return`, e é o que faz *"a feature não aparece"* custar nada.
        if (!host.available()) return;

        /*
         * **Uma chamada por passada**, e não uma por workspace.
         *
         * A consulta é `label:lumem` contra a chave do cofre, e nem o rótulo nem
         * a chave têm workspace dentro: perguntar dentro do laço devolveria o
         * mesmo conjunto N vezes, e a cota medida no §3.2 do estudo — 2,4% a
         * 60 s — passaria a ser `N × 2,4%` por nada.
         */
        const issues = await host.labelled(LUMEM_LABEL);
        const spaces = await db.select({ id: workspace.id }).from(workspace);
        for (const space of spaces) {
          await syncTracker({ db, host, projectFor: firstProjectOf(db) }, space.id, issues);
        }
      } catch (error) {
        /*
         * A **mensagem**, e não o objeto — a lição que o laço da esteira pagou:
         * o pino serializa um `Error` sem a frase, que é a única parte que diz o
         * que aconteceu. E ela já vem redigida do host.
         */
        log?.warn(
          {
            tag: "tracker-sync-failed",
            message: error instanceof Error ? error.message : String(error),
          },
          "a passada do tracker falhou",
        );
      } finally {
        running = false;
      }
    })();
  }, intervalMs);

  timer.unref?.();
  return () => {
    cancel(timer);
  };
}
