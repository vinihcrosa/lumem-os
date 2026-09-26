import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { sessionDetailKey } from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

/**
 * O retrato da sessão que a conversa não ganha pelo socket ACP (`033` T21):
 * `pendingPrompt`/`pendingReason` moram na linha (§3.3), não no protocolo —
 * o primeiro prompt segurado pelo `setup` nunca vira turno, então não há
 * frame nenhum do adaptador para carregá-lo.
 *
 * Derivado do cliente, e não importado de `@lumem/server` — mesmo motivo do
 * `ScriptStatus` em `../checkout/useScripts.ts`: um `Date` do servidor
 * atravessa a rede como texto, e o tipo do servidor prometeria um que nunca
 * chega. Anotar o retorno do hook é o que evita o TS2742 de um `tsc` que
 * alcançaria um módulo interno do pacote do servidor.
 */
export type SessionDetail = Awaited<ReturnType<typeof trpc.session.getDetail.query>>;

export function useSessionDetail(sessionId: string): UseQueryResult<SessionDetail> {
  return useQuery<SessionDetail>({
    queryKey: sessionDetailKey(sessionId),
    queryFn: () => trpc.session.getDetail.query({ id: sessionId }),
  });
}

/**
 * `mandar assim mesmo` — depois de um `setup` que falhou (`033` T21, F4.6).
 *
 * A pendência zera de verdade quando o turno **entra na conversa**, e isso a
 * `Conversation` já vê ao vivo pelo socket já anexado (`conversation.turns`):
 * não há por que esperar esta mutação para saber que o prompt saiu.
 */
export function useSendPending(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => trpc.session.sendPending.mutate({ id: sessionId }),
    onSuccess: (view) => queryClient.setQueryData(sessionDetailKey(sessionId), view),
  });
}

/**
 * `editar` — descarta o prompt pendente sem mandar (`033` T21, §3.3).
 *
 * Escreve a resposta direto no cache em vez de invalidar e esperar uma nova
 * leitura: a mutação já devolve a linha zerada, e o `Composer` de verdade só
 * volta a montar quando `pendingPrompt` some daqui — é o que dá ao rascunho
 * da chegada (`arrive`) um lugar para cair assim que ele monta.
 */
export function useDiscardPending(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => trpc.session.discardPending.mutate({ id: sessionId }),
    onSuccess: (view) => queryClient.setQueryData(sessionDetailKey(sessionId), view),
  });
}
