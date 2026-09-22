import type { AppRouter } from "@lumem/server/router-types";
import type { TRPCClient } from "@trpc/client";
import { vi, type Mock } from "vitest";

const LEAVES = new Set(["query", "mutate", "subscribe"]);

/**
 * O `Proxy` de um recurso, por trás de `createTrpcProxy`.
 *
 * `cache` é **um só mapa, por caminho inteiro** (`"agentConfig.list.query"`),
 * compartilhado por toda a árvore — e não um por nível: um `Proxy` novo nasce a
 * cada `.agentConfig`, então só a chave de texto faz duas travessias do mesmo
 * caminho devolverem o **mesmo** `vi.fn()`. Sem isso, `trpcProxy.agentConfig.list
 * .query.mockResolvedValue(...)` e a chamada que o hook faz seriam funções
 * diferentes, e o mock nunca seria visto.
 */
function branch(path: string, cache: Map<string, Mock>): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        const next = path ? `${path}.${prop}` : prop;
        if (!LEAVES.has(prop)) return branch(next, cache);
        if (!cache.has(next)) cache.set(next, vi.fn());
        return cache.get(next);
      },
    },
  );
}

/**
 * Um `Proxy` recursivo tipado por `AppRouter` — o mock de transporte de teste
 * de **hook**, e só dele: teste de tela mocka o hook (`032` Q5).
 *
 * `trpc.qualquer.coisa.query` devolve um `vi.fn()` criado sob demanda; o cast
 * final é o único lugar sem tipo, e a partir dele um caminho que o router não
 * tem é erro de `tsc`, não `undefined` em runtime.
 */
export function createTrpcProxy(): TRPCClient<AppRouter> {
  return branch("", new Map()) as TRPCClient<AppRouter>;
}
