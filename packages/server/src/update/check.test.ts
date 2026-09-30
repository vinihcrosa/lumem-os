import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { openTestDb } from "../db/testing.js";
import { createDaemonSettingsRepository } from "../repositories/daemonSettings.js";
import { BOOT_DELAY_MS, CHECK_INTERVAL_MS, createUpdateCheck, type UpdateCheck } from "./check.js";
import { createUpdateService } from "./service.js";

/**
 * A verificação de versão (`038`, Parte 2): o daemon perguntando ao registry sozinho.
 *
 * O relógio é o falso do vitest, que troca `setTimeout`, `setInterval` e `Date` de
 * uma vez — e é o que faz *"a cada 6 h"* ser um número que o teste avança, e não
 * uma frase que ele espera. O registry é um `fetch` de mentira que grava o que
 * recebeu: a URL e os cabeçalhos são o contrato, e é ali que se olha.
 */

const REGISTRY = "https://registry.npmjs.org/@vinihcrosa%2Flumem-os/latest";
const SIX_HOURS = 6 * 60 * 60 * 1_000;
const MINUTE = 60_000;

const running: UpdateCheck[] = [];

afterEach(() => {
  for (const check of running.splice(0)) check.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** O que a linha de aviso disse, em texto: `JSON.stringify` de um `Error` é `{}`. */
function said(call: readonly unknown[]): string {
  const { err } = call[0] as { err: Error };
  return `${err.name}: ${err.message}`;
}

function version(value: string): Response {
  return Response.json({ version: value });
}

function build(
  overrides: Partial<Omit<Parameters<typeof createUpdateCheck>[0], "request">> & {
    request?: Mock<typeof fetch>;
  } = {},
) {
  const request = overrides.request ?? vi.fn<typeof fetch>(async () => version("0.7.0"));
  const warn = vi.fn();
  const check = createUpdateCheck({ enabled: () => true, log: { warn }, ...overrides, request });
  running.push(check);
  return { check, request, warn };
}

describe("the update check", () => {
  it("asks the registry at boot and every six hours", async () => {
    vi.useFakeTimers();
    const { check, request } = build();
    check.start();

    // Uma vez, e dentro dos primeiros 60 s: o AC não dá o número, o código dá, e
    // este é o teto que ele não pode passar.
    expect(BOOT_DELAY_MS).toBeLessThanOrEqual(MINUTE);
    expect(CHECK_INTERVAL_MS).toBe(SIX_HOURS);
    await vi.advanceTimersByTimeAsync(BOOT_DELAY_MS - 1);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(request).toHaveBeenCalledTimes(1);

    // A URL do dist-tag `latest`, e **só** o `accept` de cabeçalho: nenhum
    // identificador além do IP e do user-agent que o runtime põe sozinho.
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe(REGISTRY);
    expect(init?.headers).toEqual({ accept: "application/json" });

    // A cada 6 h a partir dali: nem um milissegundo antes, nem sem parar.
    await vi.advanceTimersByTimeAsync(SIX_HOURS - MINUTE - 1);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(SIX_HOURS);
    expect(request).toHaveBeenCalledTimes(3);

    expect(check.last().latest).toBe("0.7.0");
  });

  it("keeps the last good answer when the registry fails", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const answers: (() => Promise<Response>)[] = [
      async () => version("0.7.0"),
      // O que o `AbortSignal.timeout` produz ao vencer.
      () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
      async () => new Response("indisponível", { status: 503 }),
      async () => Response.json({ tag: "latest" }),
      async () => version("0.8.0"),
    ];
    const request = vi.fn<typeof fetch>(async () => (answers.shift() ?? answers[0]!)());
    const { check, warn } = build({ request });
    check.start();

    // Primeiro tique: a resposta boa, gravada com a hora dela.
    await vi.advanceTimersByTimeAsync(60_000);
    const good = check.last();
    expect(good.latest).toBe("0.7.0");
    expect(good.checkedAt).toBeInstanceOf(Date);
    expect(warn).not.toHaveBeenCalled();

    // Cada falha: o `latest` e o `checkedAt` de antes ficam onde estavam, e sai
    // **uma** linha de aviso — dizendo qual foi a falha.
    await vi.advanceTimersByTimeAsync(SIX_HOURS);
    expect(check.last()).toEqual(good);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(said(warn.mock.calls[0]!)).toContain("TimeoutError");

    await vi.advanceTimersByTimeAsync(SIX_HOURS);
    expect(check.last()).toEqual(good);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(said(warn.mock.calls[1]!)).toContain("503");

    await vi.advanceTimersByTimeAsync(SIX_HOURS);
    expect(check.last()).toEqual(good);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(said(warn.mock.calls[2]!)).toContain("sem versão");

    // E a tentativa seguinte é a do próximo tique de 6 h: quatro pedidos, e o
    // quinto — depois de três falhas — é o que volta a gravar.
    await vi.advanceTimersByTimeAsync(SIX_HOURS);
    expect(request).toHaveBeenCalledTimes(5);
    expect(check.last().latest).toBe("0.8.0");
    expect(warn).toHaveBeenCalledTimes(3);

    // O teto de 10 s de cada pedido é o do `AbortSignal`, e é ele que vira a falha
    // do primeiro caso acima.
    expect(timeout).toHaveBeenCalledWith(10_000);
  });

  it("gives up a request that never answers, and writes one warning", async () => {
    // O contrário do caso acima: aqui é o `AbortSignal` de verdade que vence, com um
    // prazo curto, contra um registry que nunca responde. Relógio real — o
    // `AbortSignal.timeout` do Node não é o do vitest.
    const hung = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        }),
    );
    const { check, warn } = build({ request: hung, timeoutMs: 20 });

    await check.checkNow();

    expect(check.last()).toEqual({ latest: null, checkedAt: null });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("makes no request when the check is off", async () => {
    vi.useFakeTimers();
    let on = false;
    const { check, request } = build({ enabled: () => on });
    check.start();

    // Desligada por um ciclo inteiro e mais um: nenhuma requisição.
    await vi.advanceTimersByTimeAsync(SIX_HOURS * 2);
    expect(request).not.toHaveBeenCalled();
    expect(check.last()).toEqual({ latest: null, checkedAt: null });

    // Ligar de novo é lido no tique seguinte — sem reiniciar o daemon.
    on = true;
    await vi.advanceTimersByTimeAsync(SIX_HOURS);
    expect(request).toHaveBeenCalledTimes(1);

    // As duas formas de desligar, pela composição que o daemon usa: o ambiente
    // (`LUMEM_NO_UPDATE_CHECK=1`) e a linha `daemon_settings.update_check = 0`.
    const database = openTestDb();
    try {
      const settings = createDaemonSettingsRepository(database.db);
      const asked = vi.fn<typeof fetch>(async () => version("0.7.0"));
      const wire = (noUpdateCheck: boolean) => {
        const service = createUpdateService({
          config: { noUpdateCheck },
          settings,
          request: asked,
          shutdown: () => Promise.resolve(),
          holdPrompts: () => {},
        });
        running.push(service.check);
        return service;
      };

      const forced = wire(true);
      forced.check.start();
      await vi.advanceTimersByTimeAsync(SIX_HOURS * 2);
      expect(forced.checkEnabled()).toBe(false);

      settings.set({ updateCheck: false });
      const off = wire(false);
      off.check.start();
      await vi.advanceTimersByTimeAsync(SIX_HOURS * 2);
      expect(off.checkEnabled()).toBe(false);

      expect(asked).not.toHaveBeenCalled();

      // E ligada nas duas frentes, o mesmo daemon pergunta — o que prova que o
      // silêncio de cima era o interruptor, e não um relógio que não andou.
      settings.set({ updateCheck: true });
      const on2 = wire(false);
      on2.check.start();
      await vi.advanceTimersByTimeAsync(SIX_HOURS);
      expect(on2.checkEnabled()).toBe(true);
      expect(asked).toHaveBeenCalled();
    } finally {
      // O relógio falso não pode estar ligado quando o SQLite fecha o arquivo.
      for (const check of running.splice(0)) check.stop();
      database.cleanup();
    }
  });
});
