import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runConveyorLoop } from "./conveyor-loop.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * O relógio da esteira (`028` Parte 2).
 *
 * Testado com o `setInterval` injetado, porque o que está sob teste não é o
 * tempo: é **quantas passadas acontecem ao mesmo tempo** e **o que sobrevive a
 * uma que falha**. As duas perguntas são de concorrência, e nenhuma precisa
 * esperar 15 segundos para ser respondida.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

/** Um `setInterval` que devolve o disparo na mão de quem testa. */
function manualClock() {
  let fire: (() => void) | null = null;
  const schedule = ((callback: () => void) => {
    fire = callback;
    return { unref: () => undefined } as unknown as NodeJS.Timeout;
  }) as unknown as typeof globalThis.setInterval;
  return { schedule, tick: () => fire?.() };
}

describe("uma passada por vez", () => {
  it("a passada seguinte não entra enquanto a anterior não terminou", async () => {
    context = createTestCaller();
    await context.api.workspace.create({ name: `acme-${newId()}` });
    const clock = manualClock();
    let release = (): void => undefined;
    const tick = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => {
            resolve(0);
          };
        }),
    );

    const stop = runConveyorLoop({
      db: context.db,
      conveyor: { tick, send: async () => undefined },
      setInterval: clock.schedule,
    });

    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    /*
     * Sem a trava, uma passada lenta — o `setup` de um projeto grande — seria
     * alcançada pela seguinte, e as duas leriam a **mesma** fila: o cartão ainda
     * não tem turno em voo, então as duas o pegariam e abririam **duas sessões
     * para a mesma tarefa**. É o único lugar em que o *"um escritor só"* do ADR
     * precisa de ajuda, e a ajuda é um booleano — não um lease.
     */
    expect(tick).toHaveBeenCalledTimes(1);
    release();
    stop();
  });
});

describe("uma passada que falha não derruba o laço", () => {
  it("o erro vira log com etiqueta procurável, e a próxima passada acontece", async () => {
    context = createTestCaller();
    await context.api.workspace.create({ name: `acme-${newId()}` });
    const clock = manualClock();
    const warn = vi.fn();
    const tick = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("o repositório sumiu"))
      .mockResolvedValue(0);

    const stop = runConveyorLoop({
      db: context.db,
      conveyor: { tick, send: async () => undefined },
      setInterval: clock.schedule,
      log: { warn },
    });

    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    /*
     * Sem isto, um projeto com o repositório movido pararia a esteira de **todos
     * os outros workspaces**, e o sintoma seria *"parou de andar"* sem nada na
     * tela.
     */
    expect(tick).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ tag: "conveyor-tick-failed" });
    stop();
  });
});

describe("o que ela percorre", () => {
  it("todos os workspaces, e não o que está aberto na tela", async () => {
    context = createTestCaller();
    const first = await context.api.workspace.create({ name: `um-${newId()}` });
    const second = await context.api.workspace.create({ name: `dois-${newId()}` });
    const clock = manualClock();
    const seen: string[] = [];

    const stop = runConveyorLoop({
      db: context.db,
      conveyor: {
        tick: async (id) => {
          seen.push(id);
          return 0;
        },
        send: async () => undefined,
      },
      setInterval: clock.schedule,
    });

    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A esteira roda no daemon, e o daemon não sabe o que o browser está
    // mostrando — nem deve, porque fechar a janela não pode parar o trabalho.
    expect(seen.sort()).toEqual([first.id, second.id].sort());
    stop();
  });
});
