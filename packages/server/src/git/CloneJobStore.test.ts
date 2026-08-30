import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCloneJobStore,
  KEEP_TERMINAL_MS,
  THROTTLE_MS,
  type CloneJob,
  type CloneJobStore,
} from "./CloneJobStore.js";

afterEach(() => {
  vi.useRealTimers();
});

function started(store: CloneJobStore, name = "api"): CloneJob {
  return store.start({
    workspaceId: "ws1",
    url: "https://github.com/org/api.git",
    targetPath: `/estado/workspaces/pessoal/${name}/repo`,
    name,
  });
}

/**
 * Drains a subscription into an array, and stops it on demand.
 *
 * Written as a helper rather than inline so every test asserts on the same
 * lifecycle: subscribe, act, read, abort — the shape `events.test.ts` uses.
 */
function collector(store: CloneJobStore, id: string) {
  const seen: CloneJob[] = [];
  const controller = new AbortController();
  const done = (async () => {
    for await (const job of store.subscribe(id, controller.signal)) seen.push(job);
  })();
  return { seen, stop: () => controller.abort(), done };
}

/** Lets the microtask queue run, which is what moves an async generator on. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("um clone por vez", () => {
  it("recusa o segundo, nomeando o primeiro", () => {
    // Q17. Sem fila: fila é mais estado, mais uma tela e mais uma ordem para
    // explicar, tudo por um caso que não acontece.
    const store = createCloneJobStore();
    started(store, "api");

    expect(() => started(store, "lorebase")).toThrow(/já há um clone em andamento: api/);
  });

  it("libera a vez quando o primeiro termina", () => {
    const store = createCloneJobStore();
    const primeiro = started(store, "api");
    store.fail(primeiro.id, "git", "deu ruim");

    expect(() => started(store, "lorebase")).not.toThrow();
  });

  it("libera a vez quando o primeiro é cancelado", () => {
    const store = createCloneJobStore();
    const primeiro = started(store, "api");
    store.cancel(primeiro.id);

    expect(store.active()).toBeUndefined();
    expect(() => started(store, "lorebase")).not.toThrow();
  });
});

describe("as transições", () => {
  it("caminha de cloning a done", () => {
    const store = createCloneJobStore();
    const job = started(store);

    store.registering(job.id);
    store.done(job.id, "p1");

    expect(store.get(job.id)).toMatchObject({ state: "done", projectId: "p1", percent: 100 });
  });

  it("recusa uma transição ilegal em vez de escrever um estado ilegível", () => {
    // Silêncio aqui apareceria como uma barra de progresso que recomeça sozinha.
    const store = createCloneJobStore();
    const job = started(store);
    store.fail(job.id, "git", "deu ruim");

    expect(() => store.done(job.id, "p1")).toThrow(/não pode passar para/);
  });

  it("não deixa cancelar depois de o download acabar", () => {
    // F6.6: o disco já tem o repositório e o que falta é uma linha em SQLite.
    const store = createCloneJobStore();
    const job = started(store);
    store.registering(job.id);

    expect(() => store.cancel(job.id)).toThrow(/não dá mais para cancelar/);
  });

  it("aborta o sinal do processo ao cancelar", () => {
    const store = createCloneJobStore();
    const job = started(store);
    const signal = store.signalOf(job.id);

    store.cancel(job.id);

    expect(signal.aborted).toBe(true);
  });

  it("ignora progresso que chega depois do fim", () => {
    // A corrida real: o processo emite uma última linha entre o cancelamento e
    // a morte dele. Reabrir o job por causa disso seria pior que perder a linha.
    const store = createCloneJobStore();
    const job = started(store);
    store.cancel(job.id);

    store.progress(job.id, { phase: "receiving", percent: 42, message: "atrasada" });

    expect(store.get(job.id)).toMatchObject({ state: "cancelled", percent: null });
  });
});

describe("a assinatura", () => {
  it("entrega o estado atual assim que alguém escuta", async () => {
    const store = createCloneJobStore();
    const job = started(store);
    const sub = collector(store, job.id);

    await settle();

    expect(sub.seen).toHaveLength(1);
    expect(sub.seen[0]).toMatchObject({ state: "cloning" });
    sub.stop();
  });

  it("estrangula o progresso em 250 ms", async () => {
    vi.useFakeTimers();
    const store = createCloneJobStore();
    const job = started(store);
    const sub = collector(store, job.id);
    await vi.advanceTimersByTimeAsync(0);
    sub.seen.length = 0;

    for (let percent = 1; percent <= 20; percent += 1) {
      store.progress(job.id, { phase: "receiving", percent, message: `${percent}%` });
    }
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);

    // Uma passagem imediata mais a de arrasto, e não vinte.
    expect(sub.seen.length).toBeLessThanOrEqual(2);
    expect(sub.seen.at(-1)).toMatchObject({ percent: 20 });
    sub.stop();
  });

  it("entrega o estado terminal mesmo caindo dentro da janela do estrangulamento", async () => {
    // O teste que mais importa aqui. Um terminal engolido pelo estrangulamento
    // deixa a barra em 97% para sempre — e é a única perda irreversível.
    vi.useFakeTimers();
    const store = createCloneJobStore();
    const job = started(store);
    const sub = collector(store, job.id);
    await vi.advanceTimersByTimeAsync(0);
    sub.seen.length = 0;

    store.progress(job.id, { phase: "receiving", percent: 97, message: "97%" });
    await vi.advanceTimersByTimeAsync(1);
    store.registering(job.id);
    store.done(job.id, "p1");
    await vi.advanceTimersByTimeAsync(0);

    expect(sub.seen.at(-1)).toMatchObject({ state: "done", projectId: "p1" });
  });

  it("termina sozinha no estado terminal", async () => {
    const store = createCloneJobStore();
    const job = started(store);
    const sub = collector(store, job.id);
    await settle();

    store.fail(job.id, "auth", "Authentication failed");
    await sub.done;

    expect(sub.seen.at(-1)).toMatchObject({ state: "failed", failure: "auth" });
    expect(store.listenerCount).toBe(0);
  });

  it("libera o ouvinte quando o cliente vai embora", async () => {
    // Sem isto, cada reconexão deixaria um para trás num daemon feito para
    // rodar por semanas — o mesmo vazamento que o `events.ts` evita.
    const store = createCloneJobStore();
    const job = started(store);
    const sub = collector(store, job.id);
    await settle();
    expect(store.listenerCount).toBe(1);

    sub.stop();
    await sub.done;

    expect(store.listenerCount).toBe(0);
  });
});

describe("a coleta", () => {
  it("esquece job terminal depois de um tempo", () => {
    vi.useFakeTimers();
    const store = createCloneJobStore();
    const job = started(store);
    store.fail(job.id, "git", "deu ruim");

    vi.advanceTimersByTime(KEEP_TERMINAL_MS + 1);

    expect(store.get(job.id)).toBeUndefined();
  });

  it("não esquece o que ainda está rodando", () => {
    vi.useFakeTimers();
    const store = createCloneJobStore();
    const job = started(store);

    vi.advanceTimersByTime(KEEP_TERMINAL_MS * 10);

    expect(store.get(job.id)).toMatchObject({ state: "cloning" });
  });
});

describe("o segredo", () => {
  it("não entra em nenhum campo do job", () => {
    // D6: o segredo morre na fronteira. Aqui já chega sanitizado, e este teste
    // é o que impede alguém de passar a `rawUrl` por engano.
    const store = createCloneJobStore();
    const job = store.start({
      workspaceId: "ws1",
      url: "https://github.com/org/api.git",
      targetPath: "/estado/workspaces/pessoal/api/repo",
      name: "api",
    });

    expect(JSON.stringify(job)).not.toContain("@");
  });
});
