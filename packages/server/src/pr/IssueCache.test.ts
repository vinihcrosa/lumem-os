import { describe, expect, it } from "vitest";

import { createIssueCache, ISSUE_TTL_MS } from "./IssueCache.js";
import type { GhIssue, PrHost } from "./PrHost.js";

const PROJECT = { id: "p1", path: "/repo", remoteUrl: "https://github.com/exemplo/repo.git" };

function issue(number: number): GhIssue {
  return {
    number,
    title: `issue ${number}`,
    state: "OPEN",
    url: `https://github.com/exemplo/repo/issues/${number}`,
    updatedAt: "2026-09-07T00:00:00Z",
    author: "alguem",
    labels: [],
  };
}

/** Um relógio que só anda quando o teste manda. */
function clock() {
  let value = 0;
  return { now: () => value, advance: (ms: number) => (value += ms) };
}

/**
 * Um host que conta quantas vezes foi perguntado.
 *
 * A contagem **é** o teste: um cache que não guarda nada passa em todas as
 * asserções de conteúdo e falha só aqui.
 */
function countingHost(answer: (n: number) => Promise<unknown> = () => Promise.resolve(null)) {
  let calls = 0;
  const host = {
    name: "fake",
    supports: () => true,
    read: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
    create: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
    merge: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
    issues: async () => {
      calls += 1;
      const override = await answer(calls);
      return override ?? { ok: true as const, issues: [issue(calls)] };
    },
  } as unknown as PrHost;
  return { host, calls: () => calls };
}

describe("IssueCache", () => {
  it("pergunta uma vez só quando dois pedidos chegam juntos", async () => {
    const { host, calls } = countingHost();
    const cache = createIssueCache({ host, now: clock().now });

    const [a, b] = await Promise.all([cache.get(PROJECT), cache.get(PROJECT)]);

    expect(calls()).toBe(1);
    expect(a.issues).toEqual(b.issues);
  });

  it("não vai ao host de novo dentro do TTL", async () => {
    // Abrir o diálogo, fechar e abrir de novo é o gesto mais comum aqui, e ele
    // não pode custar ~730ms de rede a cada vez.
    const { host, calls } = countingHost();
    const time = clock();
    const cache = createIssueCache({ host, now: time.now });

    await cache.get(PROJECT);
    time.advance(ISSUE_TTL_MS - 1);
    const second = await cache.get(PROJECT);

    expect(calls()).toBe(1);
    expect(second.issues?.[0]?.number).toBe(1);
  });

  it("vai ao host quando o valor envelheceu", async () => {
    const { host, calls } = countingHost();
    const time = clock();
    const cache = createIssueCache({ host, now: time.now });

    await cache.get(PROJECT);
    time.advance(ISSUE_TTL_MS);
    const second = await cache.get(PROJECT);

    expect(calls()).toBe(2);
    expect(second.issues?.[0]?.number).toBe(2);
  });

  it("vai ao host quando alguém pede de propósito, mesmo fresco", async () => {
    const { host, calls } = countingHost();
    const cache = createIssueCache({ host, now: clock().now });

    await cache.get(PROJECT);
    await cache.get(PROJECT, { force: true });

    expect(calls()).toBe(2);
  });

  it("mantém a última lista conhecida quando a leitura falha", async () => {
    // O mesmo princípio do PrCache: trocar uma informação verdadeira e velha
    // por nenhuma, por causa da rede, é perder dado de graça.
    const { host } = countingHost((n) =>
      Promise.resolve(
        n === 1 ? null : { ok: false, failure: { kind: "offline", message: "sem rede" } },
      ),
    );
    const time = clock();
    const cache = createIssueCache({ host, now: time.now });

    await cache.get(PROJECT);
    time.advance(ISSUE_TTL_MS);
    const second = await cache.get(PROJECT);

    expect(second.issues?.[0]?.number).toBe(1);
    expect(second.failure).toMatchObject({ kind: "offline" });
    expect(second.readAt).not.toBeNull();
  });

  it("não guarda nada de um projeto esquecido", async () => {
    const { host, calls } = countingHost();
    const cache = createIssueCache({ host, now: clock().now });

    await cache.get(PROJECT);
    cache.forget(PROJECT.id);
    await cache.get(PROJECT);

    expect(calls()).toBe(2);
  });

  it("não pergunta a um projeto sem remoto", async () => {
    // Sem remoto não há host, e o diálogo não oferece a aba. Perguntar seria um
    // processo por abertura para receber sempre a mesma recusa.
    const { host, calls } = countingHost();
    const cache = createIssueCache({ host, now: clock().now });

    const entry = await cache.get({ ...PROJECT, remoteUrl: null });

    expect(calls()).toBe(0);
    expect(entry.failure).toMatchObject({ kind: "unsupported-host" });
    expect(entry.issues).toBeNull();
  });
});
