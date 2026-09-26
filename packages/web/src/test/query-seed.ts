import { QueryClient } from "@tanstack/react-query";

/**
 * Um `QueryClient` pré-carregado, para a galeria (`032-web-architecture` T33).
 *
 * `pnpm build-storybook` não passa pelo Vitest — `vi.mock` só existe dentro
 * dele, e o padrão que os testes de componente usam para calar o transporte
 * (`vi.mock("../../lib/trpc.js", ...)`, com `trpc-mock.ts` ou o `Proxy` de
 * `trpc-proxy.ts`) não é alcançável de um `.stories.tsx`: chamar `vi.mock` fora
 * do runner do Vitest não intercepta nada, e o `import` continua apontando
 * para o cliente de verdade.
 *
 * O que dá o mesmo resultado sem mock nenhum: `staleTime: Infinity` mais o
 * dado já em cache. Nesse estado o `useQuery` nunca considera a leitura
 * obsoleta — a `queryFn`, que é quem chamaria `trpc.*.query` e bateria em
 * `/trpc` de verdade, **nunca roda**. A story monta sem chamada de rede pelo
 * mesmo motivo que uma tela com dado já resolvido não refaz a pergunta.
 */
export function seededQueryClient(
  seed: ReadonlyArray<readonly [key: readonly unknown[], data: unknown]>,
): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
    },
  });
  for (const [key, data] of seed) client.setQueryData(key, data);
  return client;
}
