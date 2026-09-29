import type { AppRouter } from "@lumem/server/router-types";
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  httpSubscriptionLink,
  splitLink,
  type TRPCClient,
} from "@trpc/client";

/**
 * O que não entra no lote, porque um lote responde quando o último responde.
 *
 * Medido no app de verdade (`034` T18): o `setup.probe` sobe o adaptador e leva
 * de 4 a 9 s, e no mesmo lote segurava `workspace.slots`, `agentAccount.list` e
 * as listas de sessão — a tela de configurações inteira esperava o adaptador
 * responder a uma pergunta que ela não tinha feito. Entra aqui o que sobe um
 * processo ou espera uma pessoa; o resto continua agrupado.
 */
const ALONE = new Set([
  "setup.probe",
  "setup.authenticate",
  "setup.installAdapter",
  "session.createAgent",
  "session.continueIn",
  "worktree.start",
]);

export function travelsAlone(path: string): boolean {
  return ALONE.has(path);
}

/**
 * O teto de URL de um lote.
 *
 * Um lote de `query` viaja por `GET`, com os caminhos e as entradas na URL, e o
 * servidor HTTP do Node conta a linha de requisição no teto de cabeçalho (16 KB).
 * Medido no CI da `035`: a sidebar com as worktrees do `repo-acp` pediu um
 * `session.listByScope` por worktree no mesmo tique, o lote chegou a 16 090
 * caracteres, voltou `431` com corpo vazio, e a lista virou *"Unexpected end of
 * JSON input"*. Acima deste número o `httpBatchLink` parte o lote em dois.
 */
export const MAX_BATCH_URL_LENGTH = 4_000;

/**
 * Vanilla tRPC client driven by TanStack Query at the call site.
 *
 * The return type is annotated explicitly rather than inferred: the inferred
 * type reaches into the server package's internals, which the web package
 * cannot name when emitting declarations (TS2742).
 */
export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      // Subscriptions are a long-lived stream, so they cannot share the
      // batching link: one open request would hold a batch open forever.
      condition: (operation) => operation.type === "subscription",
      true: httpSubscriptionLink({ url: "/trpc" }),
      false: splitLink({
        condition: (operation) => travelsAlone(operation.path),
        true: httpLink({ url: "/trpc" }),
        false: httpBatchLink({ url: "/trpc", maxURLLength: MAX_BATCH_URL_LENGTH }),
      }),
    }),
  ],
});
