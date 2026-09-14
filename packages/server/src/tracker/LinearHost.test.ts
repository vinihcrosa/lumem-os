import { describe, expect, it, vi } from "vitest";

import { createLinearHost, LINEAR_SECRET } from "./LinearHost.js";
import { redactKey } from "./TrackerHost.js";

/**
 * O host do Linear (`028` Parte 5, T42).
 *
 * O que este arquivo mais cobra é a regra do
 * [ADR do segredo](../../../../docs/adr/2026-09-13-1531-tracker-credentials-come-from-the-environment.md):
 * **a chave nunca sai**. E ela é cobrada por teste e não por leitura, porque é
 * exatamente o tipo de propriedade que um refactor bem-intencionado quebra.
 */

const KEY = "lin_api_segredo_que_nao_pode_vazar";

/** Um cofre em memória. O de verdade tem os testes dele no `secrets/`. */
function vault(value: string | null) {
  return { has: () => value !== null, read: () => value };
}
const withKey = vault(KEY);
const empty = vault(null);

/** O envelope do GraphQL, que é o que o host de verdade devolve. */
function answering(data: unknown, init: { ok?: boolean; status?: number; raw?: unknown } = {}) {
  const body = init.raw ?? { data };
  return vi.fn(async () =>
    Promise.resolve({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response),
  );
}

describe("sem a chave, a feature não existe — e não quebra", () => {
  it("`available` é falso e a listagem devolve vazio", async () => {
    const fetch = answering({});
    const host = createLinearHost({ fetch, secrets: empty });

    expect(host.available()).toBe(false);
    // Ausência **não é erro**, e é o mesmo desenho de um projeto sem `test`
    // declarado: a feature não aparece, e nada falha.
    expect(await host.labelled("lumem")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("com a chave, `available` é verdadeiro", () => {
    expect(createLinearHost({ secrets: withKey }).available()).toBe(true);
  });

  it("o que o host expõe é o **id do serviço**", () => {
    // Nunca o valor: um id diz *"é esta credencial"* e é inútil para quem o
    // intercepta. É o que a tela usa para saber qual campo é qual.
    expect(createLinearHost({ secrets: withKey }).secretId).toBe(LINEAR_SECRET);
  });
});

describe("a chave nunca sai", () => {
  it("um erro de rede que ecoa a requisição sai redigido", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error(`fetch failed: authorization ${KEY}`)));
    const host = createLinearHost({ fetch, secrets: withKey });

    /*
     * Parece exagero — a chave não estaria num erro de DNS —, e não é: alguns
     * clientes HTTP ecoam a requisição inteira, cabeçalhos inclusive, no
     * `TypeError: fetch failed`. Redigir sempre custa uma linha; o contrário
     * custa uma chave num log.
     */
    await expect(host.labelled("lumem")).rejects.toThrow(/•••/);
    await expect(host.labelled("lumem")).rejects.not.toThrow(new RegExp(KEY));
  });

  it("uma resposta de erro do host que devolve a chave sai redigida", async () => {
    const fetch = answering(null, {
      ok: false,
      status: 401,
      raw: { message: `invalid key ${KEY}` },
    });
    const host = createLinearHost({ fetch, secrets: withKey });

    await expect(host.labelled("lumem")).rejects.not.toThrow(new RegExp(KEY));
  });

  it("um erro do GraphQL que cita a chave sai redigido", async () => {
    const fetch = answering(null, { raw: { errors: [{ message: `bad token ${KEY}` }] } });
    const host = createLinearHost({ fetch, secrets: withKey });

    await expect(host.labelled("lumem")).rejects.toThrow(/bad token •••/);
  });

  it("`redactKey` não inventa quando não há segredo", () => {
    // Um `undefined` virando a string `"undefined"` faria o `split` trocar
    // pedaços de mensagem legítima por pontos.
    expect(redactKey("mensagem inteira", undefined)).toBe("mensagem inteira");
    expect(redactKey("mensagem inteira", "")).toBe("mensagem inteira");
  });
});

describe("a tradução é nossa", () => {
  const node = {
    id: "iss-1",
    identifier: "ACME-142",
    title: "o /orders devolve 500",
    description: "quando o carrinho está vazio",
    url: "https://linear.app/acme/issue/ACME-142",
    state: { type: "started" },
    assignee: { id: "user-1" },
  };

  it("cinco tipos de estado do Linear viram dois do Lumem", async () => {
    const cases: [string, string][] = [
      ["backlog", "open"],
      ["unstarted", "open"],
      ["started", "open"],
      ["completed", "closed"],
      ["canceled", "closed"],
    ];

    for (const [type, expected] of cases) {
      const fetch = answering({ issues: { nodes: [{ ...node, state: { type } }] } });
      const host = createLinearHost({ fetch, secrets: withKey });
      const [issue] = await host.labelled("lumem");

      /*
       * O que o Lumem precisa saber é uma coisa só: *ela ainda está aberta?*. É
       * o ADR de 2026-09-13 — o modelo é nosso, e o que vem de fora se adapta —
       * e é o que impede um sexto tipo de estado do Linear de virar um sexto
       * estado daqui.
       */
      expect(issue?.state).toBe(expected);
    }
  });

  it("uma issue sem descrição tem corpo vazio, e não `null`", async () => {
    const fetch = answering({ issues: { nodes: [{ ...node, description: null }] } });
    const [issue] = await createLinearHost({ fetch, secrets: withKey }).labelled("lumem");

    // O corpo da tarefa é `NOT NULL DEFAULT ''` desde a `022`; deixar um `null`
    // atravessar transformaria a tradução em problema de quem escreve.
    expect(issue?.body).toBe("");
  });

  it("sem responsável, `assignee` é `null` — e é o que a Q63 compara", async () => {
    const fetch = answering({ issues: { nodes: [{ ...node, assignee: null }] } });
    const [issue] = await createLinearHost({ fetch, secrets: withKey }).labelled("lumem");

    expect(issue?.assignee).toBeNull();
  });

  it("a chave da issue é o identificador legível, e o id é o opaco", async () => {
    const fetch = answering({ issues: { nodes: [node] } });
    const [issue] = await createLinearHost({ fetch, secrets: withKey }).labelled("lumem");

    // O `key` é o que o cartão mostra (`↗ ACME-142`); o `id` é o que vira
    // `external_id` e o que a escrita de volta usa.
    expect(issue).toMatchObject({ key: "ACME-142", id: "iss-1" });
  });
});

describe("a chamada", () => {
  it("manda a chave no cabeçalho, e só lá", async () => {
    const fetch = answering({ issues: { nodes: [] } });
    await createLinearHost({ fetch, secrets: withKey }).labelled("lumem");

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["authorization"]).toBe(KEY);
    // E **não** no corpo: uma chave em `body` iria para qualquer log de
    // requisição que alguém ligue depois.
    expect(String(init.body)).not.toContain(KEY);
  });
});

describe("a cauda da lista não é descartada em silêncio", () => {
  /** Uma issue por página, com o cursor que o Linear devolveria. */
  function pages(...batches: { id: string; next: string | null }[][]) {
    const queue = [...batches];
    return vi.fn(async () => {
      const batch = queue.shift() ?? [];
      const last = batch.at(-1);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              issues: {
                pageInfo: { hasNextPage: last?.next != null, endCursor: last?.next ?? null },
                nodes: batch.map((one) => ({
                  id: one.id,
                  identifier: one.id,
                  title: one.id,
                  description: null,
                  url: `https://linear.app/${one.id}`,
                  state: { type: "started" },
                  assignee: null,
                })),
              },
            },
          }),
        text: () => Promise.resolve(""),
      } as unknown as Response);
    });
  }

  it("segue o cursor até o fim", async () => {
    /*
     * Com uma página só de 50, a 51ª issue rotulada era descartada **sem erro,
     * sem log e sem entrar em workspace nenhum**: a fila travava em 50 e o único
     * sinal era não haver sinal — e uma fila que anda sozinha é onde ninguém
     * procura.
     */
    const fetch = pages([{ id: "A-1", next: "cur-1" }], [{ id: "A-2", next: null }]);

    const issues = await createLinearHost({ fetch, secrets: withKey }).labelled("lumem");

    expect(issues.map((one) => one.key)).toEqual(["A-1", "A-2"]);
    const [, second] = fetch.mock.calls as unknown as [unknown, [string, RequestInit]];
    expect(String(second[1].body)).toContain("cur-1");
  });

  it("uma página que diz que acabou custa uma chamada só", async () => {
    // A cota do §3.2 é medida com uma chamada por passada, e paginar não pode
    // virar duas para quem tem três issues.
    const fetch = pages([{ id: "A-1", next: null }]);

    await createLinearHost({ fetch, secrets: withKey }).labelled("lumem");

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("a mutation recusada com `200` não passa por escrita", () => {
  it("`success: false` lança, em vez de virar silêncio", async () => {
    /*
     * Issue arquivada, token sem permissão de comentar: o Linear responde `200`
     * com `success: false` e **sem** `errors`, então nada no envelope lança.
     * Descartar o resultado fazia disso silêncio absoluto — e o `writeMark`
     * reserva o marco **antes** de escrever, então o marco ficaria registrado
     * como escrito para sempre, sem o comentário ter saído e sem nada no log.
     */
    const fetch = answering({ commentCreate: { success: false } });

    await expect(
      createLinearHost({ fetch, secrets: withKey }).comment("iss-1", "oi"),
    ).rejects.toThrow(/recusou comentar/);
  });

  it("mover estado tem a mesma guarda", async () => {
    const fetch = answering({ issueUpdate: { success: false } });

    await expect(
      createLinearHost({ fetch, secrets: withKey }).moveState("iss-1", "st-1"),
    ).rejects.toThrow(/recusou mover/);
  });

  it("`success: true` passa", async () => {
    const fetch = answering({ commentCreate: { success: true } });

    await expect(
      createLinearHost({ fetch, secrets: withKey }).comment("iss-1", "oi"),
    ).resolves.toBeUndefined();
  });
});

describe("a resposta malformada tem nome", () => {
  it("`200` sem dados e sem erros não vira um TypeError no meio da tradução", async () => {
    // Um proxy corporativo que devolve página de login com status 200 produz
    // exatamente isto. Sem a guarda, o sintoma é um `Cannot read properties of
    // undefined`, que não fala de rede nenhuma.
    const fetch = answering(null, { raw: {} });

    await expect(createLinearHost({ fetch, secrets: withKey }).labelled("lumem")).rejects.toThrow(
      /sem dados/,
    );
  });
});
