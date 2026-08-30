import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { scriptsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import type { Scope } from "./useSessionsByScope.js";

/**
 * As fases que o rodapé conhece.
 *
 * Escrita à mão e não derivada do daemon de propósito: é o que o **cliente** manda,
 * e o `zod` do lado de lá é quem recusa o que não existe. Um tipo derivado esconderia
 * uma fase nova aparecendo sem ninguém decidir onde ela vai na tela.
 */
export type ScriptPhase = "setup" | "run" | "test" | "teardown";

/**
 * O estado como ele **chega**, e não como o daemon o declara.
 *
 * Derivado do **cliente** em vez de importado do módulo que o produz, e a diferença
 * é real: não há transformer aqui, então um `Date` do servidor atravessa a rede como
 * texto. O tipo do cliente já sabe disso — importar o do daemon prometeria um `Date`
 * que nunca chega. (E `@trpc/server` não é dependência deste pacote de propósito: o
 * servidor não pode vazar para o bundle.)
 *
 * Anotar o retorno do hook também é o que evita o TS2742: a inferência crua alcança
 * um módulo interno do pacote do servidor, que o pacote web não consegue nomear.
 */
export type ScriptStatus = Awaited<ReturnType<typeof trpc.scripts.status.query>>;

/**
 * O estado dos scripts de um checkout.
 *
 * Uma leitura para as três abas do rodapé, e não uma por aba: elas mostram partes
 * diferentes do mesmo estado, e três consultas dariam três respostas de instantes
 * diferentes na mesma tela.
 *
 * O daemon ainda não empurra isto — o `session.changed` existe, mas a porta
 * descoberta chega depois dele, quando o processo imprime. Então enquanto houver
 * algo vivo a leitura se repete; parada, ela para junto.
 */
const LIVE_POLL_MS = 2_000;

export function useScripts(scope: Scope): UseQueryResult<ScriptStatus> {
  return useQuery<ScriptStatus>({
    queryKey: scriptsKey(scope.scopeType, scope.scopeId),
    queryFn: () => trpc.scripts.status.query(scope),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const alive = [data.setup, data.run, data.test, data.teardown].some(
        (phase) => phase.last?.running,
      );
      // Um `run` que acabou de subir ainda não imprimiu a porta: continuar
      // perguntando por um tempo é o que faz o botão `Abrir` aparecer sozinho.
      return alive ? LIVE_POLL_MS : false;
    },
  });
}

/**
 * Os gestos do rodapé. Todos invalidam a mesma leitura, que é a da tela inteira.
 *
 * **Não há `writeFile` aqui**, e é decisão: o vazio sem `[scripts]` pede para o
 * *agente* escrever, porque um `run = "pnpm dev"` chutado pelo produto está errado
 * na maioria dos repositórios. O `scripts.writeFile` do daemon continua existindo
 * como caminho de API — é o escritor que preserva o resto do arquivo —, e quem o
 * exercita é a suíte do servidor.
 */
export function useScriptActions(scope: Scope) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: scriptsKey(scope.scopeType, scope.scopeId) });
    // O rodapé mexe em sessão, e a sidebar conta sessões: sem isto, o ponto de
    // "tem coisa rodando" ficaria descrevendo o passado.
    void queryClient.invalidateQueries({ queryKey: ["session"] });
  };

  const start = useMutation({
    mutationFn: (phase: ScriptPhase) => trpc.scripts.start.mutate({ ...scope, phase }),
    onSettled: invalidate,
  });

  const stop = useMutation({
    mutationFn: (phase: ScriptPhase) => trpc.scripts.stop.mutate({ ...scope, phase }),
    onSettled: invalidate,
  });

  const trust = useMutation({
    mutationFn: () => trpc.scripts.trust.mutate(scope),
    onSettled: invalidate,
  });

  return { start, stop, trust };
}
