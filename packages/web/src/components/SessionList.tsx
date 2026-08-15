import { useQuery } from "@tanstack/react-query";

import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export interface SessionListProps {
  scopeType: "project" | "worktree";
  scopeId: string;
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
}

/** Sessions of one scope, F3.4. */
export function SessionList({ scopeType, scopeId, selectedId, onSelect }: SessionListProps) {
  const sessions = useQuery({
    queryKey: sessionsKey(scopeType, scopeId),
    queryFn: () => trpc.session.listByScope.query({ scopeType, scopeId }),
    // The daemon cannot push yet — T32 adds that. Until then this is the only
    // thing that notices a process dying on its own.
    refetchInterval: 3_000,
  });

  const list = sessions.data ?? [];
  if (list.length === 0) return null;

  return (
    <ul className="session-list" aria-label={`sessões de ${scopeId}`}>
      {list.map((session) => (
        <li key={session.id} data-kind={session.kind} data-state={session.state}>
          <button
            type="button"
            aria-current={session.id === selectedId}
            onClick={() => onSelect(session.id)}
          >
            {/* F3.4 wants shell and agent told apart at a glance. */}
            <span aria-hidden="true">{session.kind === "agent" ? "🤖" : "❯"}</span>{" "}
            {session.agentName ?? "shell"}
            {session.state === "exited" && " (encerrada)"}
          </button>
        </li>
      ))}
    </ul>
  );
}
