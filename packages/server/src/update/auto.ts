import type { FastifyBaseLogger } from "fastify";

import type { DaemonSettingsRepository } from "../repositories/daemonSettings.js";

import { busyNow, isIdle } from "./idle.js";
import type { UpdateService } from "./service.js";

/**
 * Atualizar sozinho quando ocioso (`038`, Parte 5; ADR de 2026-09-29-2004).
 *
 * **Um tique de 60 s que pergunta o que o `system.update` pergunta** e, se a
 * resposta é *pode*, chama o mesmo `installer.start`. Não há um segundo caminho de
 * instalação: o que a pessoa vê quando clica e o que acontece de madrugada são a
 * mesma instalação, e a mesma definição de *ocioso* (`busyNow`) — duas definições
 * seriam como o modo automático mata o turno que o manual teria recusado.
 *
 * **Esperar ocioso não fecha nada.** Até o instante da instalação o daemon aceita
 * prompt e a esteira despacha (AC 73); a porta só fecha quando `installer.start`
 * a fecha, e a partir daí a esteira pausa pelo `installing()` (AC 75).
 */

/** De quanto em quanto o daemon pergunta se já pode. */
export const AUTO_UPDATE_INTERVAL_MS = 60_000;

export interface AutoUpdateOptions {
  /** Sem supervisor ninguém sobe a versão nova depois que o daemon sai. */
  supervised: boolean;
  update: Pick<UpdateService, "current" | "check" | "installer" | "updateAvailable">;
  /** Lido a cada tique: ligar ou desligar em `/settings` vale no seguinte. */
  settings: Pick<DaemonSettingsRepository, "get">;
  busy: Parameters<typeof busyNow>[0];
  intervalMs?: number;
  /** Injetáveis para o teste não depender do relógio real. */
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  log?: Pick<FastifyBaseLogger, "warn" | "info">;
}

export interface AutoUpdate {
  /** Arma o relógio de 60 s. Chamar de novo não arma outro. */
  start(): void;
  stop(): void;
  /** Um tique, na mão de quem chama. Nunca lança: a falha vira aviso no log. */
  tick(): Promise<void>;
}

/**
 * Depois da 1.0 o major é uma quebra que a pessoa aceita, e o tique **não a
 * atravessa** (AC 74). Sob `0.x` todo aumento pode quebrar — é a convenção do
 * semver para a `0.x` —, e por isso *qualquer* aumento vale: `0.9.2 → 1.0.0` sai
 * de uma `0.x`, que já não prometia nada.
 */
function crossesMajor(current: string, latest: string): boolean {
  const major = (version: string): number =>
    Number.parseInt(version.trim().replace(/^v/, "").split(".")[0] ?? "", 10) || 0;
  return major(current) >= 1 && major(latest) > major(current);
}

export function createAutoUpdate({
  supervised,
  update,
  settings,
  busy,
  intervalMs = AUTO_UPDATE_INTERVAL_MS,
  setInterval: schedule = globalThis.setInterval,
  clearInterval: cancel = globalThis.clearInterval,
  log,
}: AutoUpdateOptions): AutoUpdate {
  let timer: NodeJS.Timeout | undefined;
  // O `runningCount` é assíncrono: um tique que demora não pode ser alcançado pelo
  // seguinte, ou os dois veriam ocioso e chamariam `start` juntos.
  let checking = false;

  function wanted(): string | null {
    if (!supervised || settings.get().autoUpdate !== "idle") return null;
    if (update.installer.installing() || !update.updateAvailable()) return null;
    const { latest } = update.check.last();
    if (latest === null || crossesMajor(update.current, latest)) return null;
    return latest;
  }

  async function tick(): Promise<void> {
    if (checking || wanted() === null) return;
    checking = true;
    try {
      // O instantâneo do fim da passada, e não o do começo: a pergunta de scripts
      // espera o banco, e nesse meio tempo a pessoa pode ter desligado o interruptor,
      // clicado em atualizar ou aberto um turno. Tudo o que decide é relido, de forma
      // síncrona, no instante do `start`.
      if (!isIdle(await busyNow(busy))) return;
      const latest = wanted();
      if (latest === null || busy.acpManager.liveTurns().length > 0) return;
      log?.info({ version: latest }, "ocioso: instalando a versão nova sozinho");
      update.installer.start(latest);
    } catch (error) {
      log?.warn({ err: error }, "a atualização automática falhou antes de começar");
    } finally {
      checking = false;
    }
  }

  return {
    start() {
      if (timer !== undefined) return;
      timer = schedule(() => void tick(), intervalMs);
      // Um `lumem run` que recebeu SIGTERM sai: o relógio não o segura.
      timer.unref?.();
    },
    stop() {
      if (timer !== undefined) cancel(timer);
      timer = undefined;
    },
    tick,
  };
}
