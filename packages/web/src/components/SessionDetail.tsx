import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { relativeAge } from "../lib/relative-time.js";
import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Chip, Glyph, Skeleton } from "../ui/index.js";
import { Terminal } from "./Terminal.js";

import "./detail.css";
import "./terminal.css";

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

  if (session.isPending) {
    return (
      <div className="detail">
        <Skeleton label="carregando a sessão" />
      </div>
    );
  }
  if (session.isError) {
    return (
      <div className="detail">
        <Banner tone="danger">{session.error.message}</Banner>
      </div>
    );
  }

  const { kind, agentName, scopeType, command, cwd, state, exitCode, createdAt } = session.data;
  const agent = kind === "agent";
  const running = state === "running";
  const name = agentName ?? "shell";

  return (
    // The one pane that is not a reading column: a terminal has columns, not a
    // measure, and the daemon is told how many by measuring this box.
    <section className="detail detail--session">
      <div className="detail__title">
        <h2>
          <Glyph tone={agent ? "agent" : "shell"}>{agent ? "◆" : "●"}</Glyph> {name}
        </h2>
        <span className="actions__spacer" />
        {running && (
          <Button variant="ghost" onClick={() => close.mutate()} disabled={close.isPending}>
            {close.isPending ? "encerrando…" : "encerrar sessão"}
          </Button>
        )}
      </div>

      <div className="chips">
        {running ? (
          <Chip tone="running" dot>
            running · {relativeAge(createdAt)}
          </Chip>
        ) : (
          <Chip tone={exitCode === 0 ? "exited" : "failed"} dot>
            exited ({exitCode ?? "?"})
          </Chip>
        )}
        <Chip>{scopeType === "worktree" ? "worktree" : "projeto"}</Chip>
        <Chip>{agent ? "agente" : "shell"}</Chip>
      </div>

      {!running && (
        <div className="detail__banner">
          {/* F5.9: it goes quiet, it does not disappear. The buffer below is
              still the last thing the process printed, which is where the
              reason is. */}
          <Banner tone="info">
            A sessão terminou. O conteúdo abaixo é o que ficou, e continua legível até você fechar.
          </Banner>
        </div>
      )}

      {close.isError && (
        <div className="detail__banner">
          <Banner tone="danger">{close.error.message}</Banner>
        </div>
      )}

      <div className="term-head">
        <Glyph tone={agent ? "agent" : "shell"}>{agent ? "◆" : "●"}</Glyph>
        <span className="term-head__cmd" title={`${command} · cwd ${cwd}`}>
          {command} <span className="dim">· cwd {cwd}</span>
        </span>
      </div>

      {/* Keyed by id so switching sessions swaps terminals instead of feeding
          one xterm two streams. Unmounting only detaches — F5.6. */}
      <Terminal key={sessionId} sessionId={sessionId} />
    </section>
  );
}
