import { fetchLatestVersion } from "@lumem/shared";
import type { FastifyBaseLogger } from "fastify";

/**
 * O daemon perguntando ao registry se há versão nova (`038`, Parte 2; ADR de
 * 2026-09-29-2004).
 *
 * **Não é telemetria**, e é por isso que cada byte do pedido está no critério: um
 * `GET` ao dist-tag `latest` só com `accept`, sem identificador além do IP e do
 * user-agent que o runtime põe. Desliga por `LUMEM_NO_UPDATE_CHECK=1` ou pelo
 * interruptor de `/settings`.
 */

/** Uma vez depois do boot — o boot já tem trabalho demais para disputar rede. */
export const BOOT_DELAY_MS = 10_000;

/** A cada 6 h a partir da primeira. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

/** O teto de cada pedido: um registry parado não segura o daemon mais que isto. */
export const CHECK_TIMEOUT_MS = 10_000;

export interface UpdateCheckOptions {
  /**
   * A verificação está ligada **agora**? Lida a cada tique, e não uma vez no boot:
   * desligar em `/settings` vale no tique seguinte, sem reiniciar o daemon.
   */
  enabled: () => boolean;
  /** O `fetch`. O de verdade por padrão; um teste passa o dele. */
  request?: typeof fetch;
  timeoutMs?: number;
  /** Quanto depois do `start` sai a primeira pergunta. Só um teste muda. */
  bootDelayMs?: number;
  log?: Pick<FastifyBaseLogger, "warn">;
}

export interface LastCheck {
  /** Da última resposta **boa**; `null` antes da primeira. */
  latest: string | null;
  checkedAt: Date | null;
}

export interface UpdateCheck {
  /** Arma o relógio: uma vez no boot, e a cada 6 h. */
  start(): void;
  stop(): void;
  /** Pergunta agora, respeitando o interruptor. Nunca lança: a falha vira aviso no log. */
  checkNow(): Promise<void>;
  last(): LastCheck;
}

export function createUpdateCheck({
  enabled,
  request = fetch,
  timeoutMs = CHECK_TIMEOUT_MS,
  bootDelayMs = BOOT_DELAY_MS,
  log,
}: UpdateCheckOptions): UpdateCheck {
  let latest: string | null = null;
  let checkedAt: Date | null = null;
  let boot: NodeJS.Timeout | undefined;
  let every: NodeJS.Timeout | undefined;

  async function checkNow(): Promise<void> {
    if (!enabled()) return;
    try {
      const found = await fetchLatestVersion({ request, timeoutMs });
      latest = found;
      checkedAt = new Date();
    } catch (error) {
      // A resposta boa de antes fica: uma rede que caiu não apaga o banner de uma
      // versão que já se sabe que existe. A próxima tentativa é o próximo tique.
      log?.warn({ err: error }, "a verificação de versão falhou; sigo com a última resposta");
    }
  }

  return {
    start() {
      if (boot !== undefined) return;
      boot = setTimeout(() => {
        void checkNow();
        every = setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
        // O relógio não segura o processo: um `lumem run` que recebeu SIGTERM sai.
        every.unref();
      }, bootDelayMs);
      boot.unref();
    },
    stop() {
      if (boot !== undefined) clearTimeout(boot);
      if (every !== undefined) clearInterval(every);
      boot = undefined;
      every = undefined;
    },
    checkNow,
    last: () => ({ latest, checkedAt }),
  };
}
