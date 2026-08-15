import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Terminal } from "./Terminal.js";
import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface SessionDetailProps {
  sessionId: string;
  onClosed: () => void;
}

/** One session's terminal and what it is, F5.10. */
export function SessionDetail({ sessionId, onClosed }: SessionDetailProps) {
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: ["session", "detail", sessionId],
    queryFn: () => trpc.session.getDetail.query({ id: sessionId }),
    refetchInterval: 3_000,
  });

  const close = useMutation({
    mutationFn: () => trpc.session.close.mutate({ id: sessionId }),
    onSuccess: async () => {
      if (session.data) {
        await queryClient.invalidateQueries({
          queryKey: sessionsKey(session.data.scopeType, session.data.scopeId),
        });
      }
      await session.refetch();
      onClosed();
    },
  });

  if (session.isPending) return <p>carregando…</p>;
  if (session.isError) return <p role="alert">{session.error.message}</p>;

  const { kind, agentName, scopeType, command, state } = session.data;

  return (
    <section className="session-detail" data-state={state}>
      <h2>{agentName ?? "shell"}</h2>
      <dl>
        <dt>tipo</dt>
        <dd>{kind === "agent" ? "agente" : "shell"}</dd>
        <dt>escopo</dt>
        <dd>{scopeType === "worktree" ? "worktree" : "projeto"}</dd>
        <dt>comando</dt>
        <dd>{command}</dd>
        <dt>estado</dt>
        <dd>{state === "running" ? "rodando" : "encerrada"}</dd>
      </dl>

      {state === "exited" && (
        // F5.9: it goes quiet, it does not disappear. The buffer below is still
        // the last thing the process printed, which is where the reason is.
        <p role="status">a sessão terminou; o conteúdo abaixo é o que ficou.</p>
      )}

      {/* Keyed by id so switching sessions swaps terminals instead of feeding
          one xterm two streams. Unmounting only detaches — F5.6. */}
      <Terminal key={sessionId} sessionId={sessionId} />

      {state === "running" && (
        <button type="button" onClick={() => close.mutate()} disabled={close.isPending}>
          {close.isPending ? "encerrando…" : "encerrar sessão"}
        </button>
      )}

      {close.isError && <p role="alert">{close.error.message}</p>}
    </section>
  );
}
