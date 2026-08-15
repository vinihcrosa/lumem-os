import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Terminal } from "../components/Terminal.js";
import { trpc } from "../lib/trpc.js";

/**
 * Throwaway screen proving the vertical slice: spawn a shell, watch it, leave
 * it running, come back to it.
 *
 * It has no workspace, project or worktree because none of those exist yet.
 * T31 replaces it with the real sidebar, and this file goes away with it.
 */

const SESSIONS_KEY = ["pty", "list"] as const;

export function TerminalSpike() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => trpc.pty.list.query(),
    // The daemon has no way to push yet — T32 adds it. Until then, polling is
    // the only thing that notices a process dying on its own.
    refetchInterval: 2_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });

  const spawn = useMutation({
    mutationFn: () => trpc.pty.spawnShell.mutate(),
    onSuccess: async (session) => {
      setSelected(session.id);
      await refresh();
    },
  });

  const close = useMutation({
    mutationFn: (id: string) => trpc.pty.close.mutate({ id }),
    onSuccess: refresh,
  });

  const list = sessions.data ?? [];
  // A session closed by someone else must not leave the pane pointing at a
  // terminal that is no longer listed.
  const active = list.find((session) => session.id === selected) ?? null;

  return (
    <section className="spike">
      <header>
        <h2>terminais</h2>
        <button type="button" onClick={() => spawn.mutate()} disabled={spawn.isPending}>
          {spawn.isPending ? "abrindo…" : "novo shell"}
        </button>
      </header>

      {spawn.isError && <p role="alert">{spawn.error.message}</p>}

      <ul aria-label="sessões">
        {list.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              aria-current={session.id === selected}
              onClick={() => setSelected(session.id)}
            >
              {session.command} · {session.state}
            </button>
            <button
              type="button"
              aria-label={`fechar ${session.id}`}
              onClick={() => close.mutate(session.id)}
            >
              fechar
            </button>
          </li>
        ))}
      </ul>

      {list.length === 0 && !sessions.isPending && <p>nenhuma sessão</p>}

      {active ? (
        // Keyed by session so switching swaps terminals instead of feeding one
        // terminal two different streams. Unmounting only detaches.
        <Terminal key={active.id} sessionId={active.id} />
      ) : (
        <p>selecione uma sessão</p>
      )}
    </section>
  );
}
