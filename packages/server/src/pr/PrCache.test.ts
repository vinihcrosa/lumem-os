import { describe, expect, it } from "vitest";

import {
  BACKOFF_MAX_MS,
  BACKOFF_START_MS,
  TTL_BUSY_MS,
  TTL_IDLE_MS,
  createPrCache,
  type PrProject,
} from "./PrCache.js";
import type { PrHost, PrRead, PrSnapshot } from "./PrHost.js";
import type { GhCheck, GhPullRequest } from "./verdict.js";

/**
 * O cache é o que faz oito worktrees custarem um processo.
 *
 * Tudo aqui é sobre **contar execuções** e sobre **o que sobra depois de uma
 * falha** — as duas coisas que, se estiverem erradas, produzem uma tela que
 * parece funcionar: uma gasta processo que ninguém vê, e a outra apaga um dado
 * verdadeiro por causa de uma rede que caiu.
 */

const PROJECT: PrProject = {
  id: "proj-1",
  path: "/tmp/repo",
  remoteUrl: "https://github.com/exemplo/repo.git",
};

function pull(over: Partial<GhPullRequest> = {}): GhPullRequest {
  return {
    number: 19,
    url: "https://github.com/exemplo/repo/pull/19",
    title: "t",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    headRefName: "pr-bar",
    baseRefName: "main",
    updatedAt: "2026-09-05T12:00:00Z",
    mergedAt: null,
    closedAt: null,
    author: "pessoa-1",
    reviews: [],
    checks: [],
    ...over,
  };
}

function running(): GhCheck {
  return {
    name: "e2e",
    app: "CI",
    status: "IN_PROGRESS",
    conclusion: "",
    url: "",
    startedAt: null,
    completedAt: null,
  };
}

function snapshot(pulls: GhPullRequest[], readAt: string): PrSnapshot {
  return {
    host: "github.com",
    repo: "exemplo/repo",
    pulls,
    merge: { merge: true, squash: true, rebase: true, deleteBranchOnMerge: false },
    readAt,
  };
}

/** Um host que responde o que o teste mandar, e conta quantas vezes o pediram. */
function scriptedHost(script: () => Promise<PrRead> | PrRead) {
  let calls = 0;
  const host: PrHost = {
    name: "GitHub",
    supports: () => true,
    read: async () => {
      calls += 1;
      return script();
    },
    create: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
    merge: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
    // Este dublê é o da barra de PR. Issues vêm por outro caminho, e é isso que
    // este `[]` diz: elas não passam pelo `PrCache`.
    issues: () => Promise.resolve({ ok: true, issues: [] }),
  };
  return { host, calls: () => calls };
}

/** Um relógio que o teste move à mão — envelhecer cache não pode custar 60 s. */
function clock(start = 1_000_000) {
  let value = start;
  return { now: () => value, advance: (ms: number) => (value += ms) };
}

describe("single-flight", () => {
  it("dez pedidos concorrentes com o cache frio produzem uma execução", async () => {
    // É o requisito da F4.5, e ele é provado contando na costura — não
    // observando que "parece rápido".
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { host, calls } = scriptedHost(async () => {
      await gate;
      return { ok: true, snapshot: snapshot([pull()], "2026-09-05T12:00:00Z") };
    });
    const cache = createPrCache({ host });

    const pending = Array.from({ length: 10 }, () => cache.get(PROJECT));
    release!();
    const results = await Promise.all(pending);

    expect(calls()).toBe(1);
    expect(cache.reads).toBe(1);
    expect(results.every((entry) => entry.snapshot?.pulls.length === 1)).toBe(true);
  });

  it("a chave é o projeto: dois projetos são duas execuções", async () => {
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([], "2026-09-05T12:00:00Z"),
    }));
    const cache = createPrCache({ host });

    await cache.get(PROJECT);
    await cache.get({ ...PROJECT, id: "proj-2" });

    expect(calls()).toBe(2);
  });
});

describe("o valor conhecido, devolvido na hora", () => {
  it("dentro do TTL não vai ao host", async () => {
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([pull()], "2026-09-05T12:00:00Z"),
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    time.advance(TTL_IDLE_MS - 1);
    await cache.get(PROJECT);

    expect(calls()).toBe(1);
  });

  it("depois do TTL devolve o velho e revalida por trás — a tela nunca pisca", async () => {
    let readAt = "2026-09-05T12:00:00Z";
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([pull()], readAt),
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    time.advance(TTL_IDLE_MS + 1);
    readAt = "2026-09-05T12:01:00Z";

    // Devolve o antigo imediatamente…
    const immediate = await cache.get(PROJECT);
    expect(immediate.readAt).toBe("2026-09-05T12:00:00Z");

    // …e a revalidação, que já foi disparada, entrega o novo.
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls()).toBe(2);
    expect((await cache.get(PROJECT)).readAt).toBe("2026-09-05T12:01:00Z");
  });

  it("o ritmo é adaptativo: com verificação rodando, o TTL é curto", async () => {
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([pull({ checks: [running()] })], "2026-09-05T12:00:00Z"),
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    time.advance(TTL_BUSY_MS + 1);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));

    expect(calls()).toBe(2);
  });

  it("PR fechada com check rodando não encurta o ritmo", async () => {
    // Um check "em andamento" numa PR que já foi mesclada é lixo do host, e
    // deixá-lo apertar o ciclo seria pagar 15 s para sempre por uma PR morta.
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([pull({ state: "MERGED", checks: [running()] })], "2026-09-05T12:00:00Z"),
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    time.advance(TTL_BUSY_MS + 1);
    await cache.get(PROJECT);

    expect(calls()).toBe(1);
  });
});

describe("a falha, que não apaga o que já se sabia", () => {
  it("o último valor volta com a idade e o motivo da falha junto", async () => {
    let fail = false;
    const { host } = scriptedHost(() =>
      fail
        ? { ok: false as const, failure: { kind: "offline" as const, message: "sem rede" } }
        : { ok: true as const, snapshot: snapshot([pull()], "2026-09-05T12:00:00Z") },
    );
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    fail = true;
    time.advance(TTL_IDLE_MS + 1);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));

    const entry = await cache.get(PROJECT);
    // Verde velho continua verde. Apagar a cor por causa da rede seria trocar
    // uma informação verdadeira e velha por nenhuma.
    expect(entry.snapshot?.pulls).toHaveLength(1);
    expect(entry.readAt).toBe("2026-09-05T12:00:00Z");
    expect(entry.failure?.kind).toBe("offline");
  });

  it("a primeira leitura que falha responde a falha, sem snapshot", async () => {
    const { host } = scriptedHost(() => ({
      ok: false,
      failure: { kind: "no-binary", message: "sem gh" },
    }));
    const cache = createPrCache({ host });

    expect(await cache.get(PROJECT)).toEqual({
      snapshot: null,
      failure: { kind: "no-binary", message: "sem gh" },
      readAt: null,
    });
  });

  it("adaptador que lança não derruba nem apaga", async () => {
    let boom = false;
    const host: PrHost = {
      name: "GitHub",
      supports: () => true,
      read: () => {
        if (boom) throw new Error("defeito do adaptador");
        return Promise.resolve({ ok: true, snapshot: snapshot([pull()], "2026-09-05T12:00:00Z") });
      },
      create: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
      merge: () => Promise.resolve({ ok: false, failure: { kind: "failed", message: "n/a" } }),
      issues: () => Promise.resolve({ ok: true, issues: [] }),
    };
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    boom = true;
    time.advance(TTL_IDLE_MS + 1);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));

    const entry = await cache.get(PROJECT);
    expect(entry.snapshot?.pulls).toHaveLength(1);
    expect(entry.failure?.kind).toBe("failed");
  });

  it("falha seguida aumenta o intervalo, até um teto", async () => {
    const { host, calls } = scriptedHost(() => ({
      ok: false,
      failure: { kind: "offline", message: "sem rede" },
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    expect(calls()).toBe(1);

    // O primeiro intervalo depois de falhar é o normal — nem mais curto, que
    // seria o absurdo de um projeto que falha consultar mais que um que
    // responde, nem mais longo, que atrasaria a volta da rede.
    time.advance(BACKOFF_START_MS - 1);
    await cache.get(PROJECT);
    expect(calls()).toBe(1);

    time.advance(2);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls()).toBe(2);

    // E o segundo é o dobro: passar o primeiro de novo não basta.
    time.advance(BACKOFF_START_MS + 1);
    await cache.get(PROJECT);
    expect(calls()).toBe(2);

    time.advance(BACKOFF_START_MS);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls()).toBe(3);
  });

  it("o backoff tem teto", async () => {
    const { host, calls } = scriptedHost(() => ({
      ok: false,
      failure: { kind: "offline", message: "sem rede" },
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    for (let i = 0; i < 12; i += 1) {
      time.advance(BACKOFF_MAX_MS + 1);
      await cache.get(PROJECT);
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Sem teto, o intervalo teria passado de 30 dias na décima segunda falha e
    // a barra ficaria congelada até alguém reiniciar o daemon.
    expect(calls()).toBe(13);
  });
});

describe("invalidar e esquecer", () => {
  it("invalidar manda a próxima leitura ao host, e limpa o backoff", async () => {
    // F7.8: escrita conserta o mundo. Insistir no backoff depois de um merge
    // que deu certo deixaria a barra verde por dez minutos depois de ela acabar.
    let fail = true;
    const { host, calls } = scriptedHost(() =>
      fail
        ? { ok: false as const, failure: { kind: "offline" as const, message: "sem rede" } }
        : { ok: true as const, snapshot: snapshot([pull()], "2026-09-05T12:05:00Z") },
    );
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    fail = false;
    cache.invalidate(PROJECT.id);

    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));

    expect(calls()).toBe(2);
    expect((await cache.get(PROJECT)).snapshot?.pulls).toHaveLength(1);
  });

  it("invalidar projeto que ninguém leu não explode", () => {
    const { host } = scriptedHost(() => ({ ok: true, snapshot: snapshot([], "2026-09-05T12:00:00Z") }));
    expect(() => createPrCache({ host }).invalidate("não-existe")).not.toThrow();
  });

  it("remover o projeto limpa a entrada — cache que sobrevive ao dono é vazamento", async () => {
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([pull()], "2026-09-05T12:00:00Z"),
    }));
    const cache = createPrCache({ host });

    await cache.get(PROJECT);
    cache.forget(PROJECT.id);
    await cache.get(PROJECT);

    expect(calls()).toBe(2);
  });
});

describe("um pedido explícito espera pela resposta", () => {
  it("depois de invalidar, a leitura seguinte traz o valor novo — e não o velho", async () => {
    /*
     * A revalidação por trás é certa para o relógio e **errada** para um
     * pedido: `tentar de novo` que devolve o valor velho e conserta um ciclo
     * depois é um botão que parece não fazer nada, e a pessoa clica de novo.
     *
     * Foi o e2e que achou: o `⟳` da coluna não mudava a barra, e o que a
     * consertava era o TTL expirando sozinho um minuto depois.
     */
    let readAt = "2026-09-05T12:00:00Z";
    const { host } = scriptedHost(() => ({ ok: true, snapshot: snapshot([pull()], readAt) }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    readAt = "2026-09-05T12:00:30Z";

    // Sem invalidar, o cache está fresco e nem pergunta.
    expect((await cache.get(PROJECT)).readAt).toBe("2026-09-05T12:00:00Z");

    cache.invalidate(PROJECT.id);
    expect((await cache.get(PROJECT)).readAt).toBe("2026-09-05T12:00:30Z");
  });

  it("o pedido é servido UMA vez — o forçado não fica ligado para sempre", async () => {
    /*
     * A mutação que sobrevivia: apagar a marcação de "servido".
     *
     * Sem ela, `want > served` nunca mais fecha, e a partir de **um** clique no
     * `⟳` todo `get` de toda worktree do projeto vira execução do `gh` — para
     * sempre. É a F4.5 inteira desligada, e é o "tempestade de processos" do §6
     * do PRD acontecendo em silêncio: nada quebra, só custa.
     */
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([pull()], "2026-09-05T12:00:00Z"),
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    cache.invalidate(PROJECT.id);
    await cache.get(PROJECT);
    expect(calls()).toBe(2);

    // A terceira está dentro do TTL de novo, e não pode executar.
    await cache.get(PROJECT);
    await cache.get(PROJECT);
    expect(calls()).toBe(2);
  });

  it("invalidar devolve o ritmo normal, e não o backoff dobrado", async () => {
    /*
     * Existe um teste chamado "invalidar … e limpa o backoff", e ele **não**
     * provava a segunda metade: o caminho forçado ignora `freshUntil`, então
     * ele nunca observava o intervalo. Este observa — pela leitura **seguinte**
     * à forçada, que é onde o backoff apareceria.
     */
    let fail = true;
    const { host, calls } = scriptedHost(() =>
      fail
        ? { ok: false as const, failure: { kind: "offline" as const, message: "sem rede" } }
        : { ok: true as const, snapshot: snapshot([pull()], "2026-09-05T12:00:00Z") },
    );
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    // Duas falhas seguidas: o intervalo já é o dobro do normal.
    await cache.get(PROJECT);
    time.advance(BACKOFF_START_MS + 1);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls()).toBe(2);

    fail = false;
    cache.invalidate(PROJECT.id);
    await cache.get(PROJECT);
    expect(calls()).toBe(3);

    // Depois de voltar a responder, o TTL é o normal — e não o dobrado que a
    // segunda falha havia deixado.
    time.advance(TTL_IDLE_MS + 1);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls()).toBe(4);
  });

  it("um pedido forçado continua sendo uma execução só, por mais gente que peça", async () => {
    const { host, calls } = scriptedHost(() => ({
      ok: true,
      snapshot: snapshot([pull()], "2026-09-05T12:00:30Z"),
    }));
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);
    cache.invalidate(PROJECT.id);
    await Promise.all(Array.from({ length: 5 }, () => cache.get(PROJECT)));

    expect(calls()).toBe(2);
  });
});

describe("a corrida que o e2e achou", () => {
  it("um pedido não é servido por uma leitura que começou antes dele", async () => {
    /*
     * O sintoma era o pior tipo possível: a barra mostrava o estado velho
     * carimbado **"há 0 s"** — a idade jurando que o dado era novo.
     *
     * O caminho: uma revalidação já estava no ar, olhando para o mundo de
     * antes; o `⟳` marcava "quero de novo"; a execução no ar terminava, gravava
     * o estado velho e limpava a marca. Um booleano não consegue distinguir
     * "esta execução serve o meu pedido" de "esta execução existe".
     */
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let readAt = "2026-09-05T12:00:00Z";

    const { host, calls } = scriptedHost(async () => {
      // Só a primeira leitura fica presa; o resto responde na hora.
      if (calls() === 2) await gate;
      return { ok: true, snapshot: snapshot([pull()], readAt) };
    });
    const time = clock();
    const cache = createPrCache({ host, now: time.now });

    await cache.get(PROJECT);

    // Uma revalidação por trás começa, e fica pendurada.
    time.advance(TTL_IDLE_MS + 1);
    await cache.get(PROJECT);

    // O mundo muda **enquanto** ela está no ar, e alguém pede de novo.
    readAt = "2026-09-05T12:05:00Z";
    cache.invalidate(PROJECT.id);
    const pedido = cache.get(PROJECT);

    release!();

    // O pedido espera a execução velha terminar e faz outra. Sem isso ele
    // receberia `12:00:00` com cara de recém-lido.
    expect((await pedido).readAt).toBe("2026-09-05T12:05:00Z");
  });
});

describe("o aviso de que o dado mudou (F6.3)", () => {
  function watching(script: () => PrRead) {
    const changed: string[] = [];
    const { host, calls } = scriptedHost(script);
    const time = clock();
    const cache = createPrCache({ host, now: time.now, onChange: (id) => changed.push(id) });
    return { cache, changed, calls, time };
  }

  it("avisa quando a leitura traz dado diferente", async () => {
    let numero = 19;
    const { cache, changed, time } = watching(() => ({
      ok: true,
      snapshot: snapshot([pull({ number: numero })], "2026-09-05T12:00:00Z"),
    }));

    await cache.get(PROJECT);
    expect(changed).toEqual([PROJECT.id]);

    numero = 21;
    cache.invalidate(PROJECT.id);
    await cache.get(PROJECT);

    expect(changed).toEqual([PROJECT.id, PROJECT.id]);
  });

  it("**não** avisa quando a leitura traz o mesmo — nem quando só o carimbo muda", async () => {
    /*
     * É a metade que importa. O poll acontece de minuto em minuto e quase
     * sempre traz o mesmo instantâneo; um aviso por leitura faria a tela
     * redesenhar por nada, e o `readAt` muda em **toda** leitura — compará-lo
     * transformaria "mudou" em "aconteceu".
     */
    let readAt = "2026-09-05T12:00:00Z";
    const { cache, changed, time } = watching(() => ({
      ok: true,
      snapshot: snapshot([pull()], readAt),
    }));

    await cache.get(PROJECT);
    expect(changed).toHaveLength(1);

    readAt = "2026-09-05T12:01:00Z";
    time.advance(TTL_IDLE_MS + 1);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));

    expect(changed).toHaveLength(1);
  });

  it("falha não avisa: nada mudou do que se sabia", async () => {
    let fail = false;
    const { cache, changed, time } = watching(() =>
      fail
        ? { ok: false as const, failure: { kind: "offline" as const, message: "sem rede" } }
        : { ok: true as const, snapshot: snapshot([pull()], "2026-09-05T12:00:00Z") },
    );

    await cache.get(PROJECT);
    fail = true;
    time.advance(TTL_IDLE_MS + 1);
    await cache.get(PROJECT);
    await new Promise((resolve) => setImmediate(resolve));

    expect(changed).toHaveLength(1);
  });
});
