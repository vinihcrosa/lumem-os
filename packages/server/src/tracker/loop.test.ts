import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runTrackerLoop } from "./loop.js";
import { LUMEM_LABEL } from "./sync.js";
import type { TrackerHost } from "./TrackerHost.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

function manualClock() {
  let fire: (() => void) | null = null;
  const schedule = ((callback: () => void) => {
    fire = callback;
    return { unref: () => undefined } as unknown as NodeJS.Timeout;
  }) as unknown as typeof globalThis.setInterval;
  return { schedule, tick: () => fire?.() };
}

function fakeHost(available: boolean, overrides: Partial<TrackerHost> = {}): TrackerHost {
  return {
    id: "linear",
    secretId: "linear",
    available: () => available,
    labelled: vi.fn(async () => Promise.resolve([])),
    comment: vi.fn(async () => Promise.resolve()),
    moveState: vi.fn(async () => Promise.resolve()),
    ...overrides,
  };
}

describe("sem a chave o laço não faz nada", () => {
  it("nem consulta o host", async () => {
    context = createTestCaller();
    await context.api.workspace.create({ name: `acme-${newId()}` });
    const clock = manualClock();
    const host = fakeHost(false);

    const stop = runTrackerLoop({ db: context.db, host, setInterval: clock.schedule });
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // É o que faz *"a feature não aparece"* custar nada: uma leitura de flag e
    // um `return`, e não uma consulta que erra sessenta vezes por hora.
    expect(host.labelled).not.toHaveBeenCalled();
    stop();
  });
});

describe("uma consulta por passada, e não uma por workspace", () => {
  it("três workspaces custam uma chamada, com o rótulo do produto", async () => {
    context = createTestCaller();
    await context.api.workspace.create({ name: `acme-${newId()}` });
    await context.api.workspace.create({ name: `beta-${newId()}` });
    await context.api.workspace.create({ name: `gama-${newId()}` });
    const clock = manualClock();
    const host = fakeHost(true);

    const stop = runTrackerLoop({ db: context.db, host, setInterval: clock.schedule });
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    /*
     * Nem o rótulo nem a chave têm workspace dentro: perguntar dentro do laço
     * devolveria o **mesmo** conjunto N vezes, e os 2,4% de cota que o §3.2 do
     * estudo mediu virariam `N × 2,4%` — com ~10 workspaces, ~24% da cota gasta
     * em chamadas idênticas.
     */
    expect(host.labelled).toHaveBeenCalledTimes(1);
    expect(host.labelled).toHaveBeenCalledWith(LUMEM_LABEL);
    stop();
  });
});

describe("uma passada que falha não derruba o laço", () => {
  it("o erro vira aviso com a mensagem, e a próxima acontece", async () => {
    context = createTestCaller();
    await context.api.workspace.create({ name: `acme-${newId()}` });
    const clock = manualClock();
    const warn = vi.fn();
    const labelled = vi
      .fn<() => Promise<never[]>>()
      .mockRejectedValueOnce(new Error("o Linear respondeu 500"))
      .mockResolvedValue([]);
    const host = fakeHost(true, { labelled });

    const stop = runTrackerLoop({ db: context.db, host, setInterval: clock.schedule, log: { warn } });
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(labelled).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      tag: "tracker-sync-failed",
      message: "o Linear respondeu 500",
    });
    stop();
  });
});

describe("uma passada por vez", () => {
  it("a seguinte não entra enquanto a anterior não terminou", async () => {
    context = createTestCaller();
    await context.api.workspace.create({ name: `acme-${newId()}` });
    const clock = manualClock();
    let release = (): void => undefined;
    const labelled = vi.fn(
      () =>
        new Promise<never[]>((resolve) => {
          release = () => {
            resolve([]);
          };
        }),
    );

    const stop = runTrackerLoop({
      db: context.db,
      host: fakeHost(true, { labelled }),
      setInterval: clock.schedule,
    });
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    clock.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    /*
     * Duas leituras simultâneas veriam a mesma issue como inexistente e
     * tentariam criá-la duas vezes: o índice único recusaria a segunda, mas com
     * um erro em vez de um `continue`.
     */
    expect(labelled).toHaveBeenCalledTimes(1);
    release();
    stop();
  });
});
