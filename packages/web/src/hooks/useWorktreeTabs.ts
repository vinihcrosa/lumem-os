import { useCallback, useEffect, useMemo, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { useSessionsByScope, type Scope } from "./useSessionsByScope.js";

export interface SessionTab {
  sessionId: string;
  label: string;
  kind: string;
  state: string;
  exitCode: number | null;
  command: string;
  /**
   * Which manager owns this session, and therefore what the tab renders.
   *
   * Read from the row rather than from the agent configuration: transport is
   * chosen when a session is born and never changes (D1), and the configuration
   * may have been edited since. A shell is always `pty`.
   */
  transport: "pty" | "acp";
  /** Only the second and later homonyms carry one. */
  ordinal?: number;
}

export interface WorktreeTabs {
  tabs: readonly SessionTab[];
  /** Null means the context tab — the worktree itself. */
  activeId: string | null;
  select(sessionId: string | null): void;
  /**
   * Dismisses the tab of a session that has already exited.
   *
   * Deliberately refuses to touch a running one: hiding a tab whose kill then
   * failed would leave a process running with nothing on screen pointing at it.
   * A running session loses its tab by actually ending.
   */
  close(sessionId: string): void;
  /** Brings an exited session back as a tab, for as long as its buffer lives. */
  reopen(sessionId: string): void;
  /**
   * Continues a finished ACP conversation in a new session (F5.2, D12).
   *
   * The new session is what the tab switches to: `session/load` starts a new adapter
   * rather than reviving the old one, so there are two rows and only one of them can
   * be talked to.
   */
  resume(sessionId: string): void;
  /** The session a resume is in flight for, or null. */
  resuming: string | null;
  sessions: ReturnType<typeof useSessionsByScope>;
}

/**
 * Which of a scope's sessions are tabs, and which tab is open.
 *
 * A tab is live work. A session that exits loses its tab on its own, because
 * the alternative is a strip that only ever grows — every agent that ever ran
 * here, forever.
 *
 * Nothing is lost with the tab. `session.close` is already a no-op for a
 * session that has exited, so dropping the tab only discards the view: the
 * record stays listed in the context tab with its exit code, the daemon's ring
 * buffer stays in memory, and `reopen` brings it back for as long as it exists.
 */
export function useWorktreeTabs(scope: Scope): WorktreeTabs {
  const sessions = useSessionsByScope(scope);
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Exited sessions the user asked to see again, and ones they dismissed. */
  const [reopened, setReopened] = useState<ReadonlySet<string>>(new Set());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const list = useMemo(() => sessions.data ?? [], [sessions.data]);

  const tabs = useMemo<SessionTab[]>(() => {
    const visible = list.filter(
      (session) =>
        !dismissed.has(session.id) &&
        (session.state === "running" || reopened.has(session.id)),
    );

    // The ordinal counts within what is visible, not within all history: a tab
    // labelled "claude-code 3" beside no 1 or 2 is a puzzle, not a hint.
    const seen = new Map<string, number>();
    return visible.map((session) => {
      const label = session.agentName ?? "shell";
      const nth = (seen.get(label) ?? 0) + 1;
      seen.set(label, nth);

      return {
        sessionId: session.id,
        label,
        kind: session.kind,
        state: session.state,
        exitCode: session.exitCode,
        command: session.command,
        transport: session.transport === "acp" ? "acp" : "pty",
        ...(nth > 1 ? { ordinal: nth } : {}),
      };
    });
  }, [list, reopened, dismissed]);

  // A tab that goes away cannot stay selected. Falling back to the context tab
  // rather than to a neighbour: after a process dies, what the user needs is
  // the worktree, not whichever session happened to be listed next to it.
  useEffect(() => {
    if (activeId !== null && !tabs.some((tab) => tab.sessionId === activeId)) {
      setActiveId(null);
    }
  }, [tabs, activeId]);

  const select = useCallback((sessionId: string | null) => setActiveId(sessionId), []);

  const close = useCallback(
    (sessionId: string) => {
      const session = list.find((candidate) => candidate.id === sessionId);
      // The tab of a live session goes away by the session ending, not by being
      // hidden — see the note on the type.
      if (session === undefined || session.state === "running") return;

      setDismissed((current) => new Set(current).add(sessionId));
      setReopened((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    },
    [list],
  );

  const reopen = useCallback((sessionId: string) => {
    setDismissed((current) => {
      const next = new Set(current);
      next.delete(sessionId);
      return next;
    });
    setReopened((current) => new Set(current).add(sessionId));
    setActiveId(sessionId);
  }, []);

  /*
   * The new session is selected in `onSuccess`, not optimistically.
   *
   * A tab only exists for a session the list knows about, so selecting an id before the
   * refetch would set an active tab that is not in `tabs` — and the effect above would
   * immediately bounce the selection back to the context tab.
   */
  const resumption = useMutation({
    mutationFn: (sessionId: string) => trpc.session.resume.mutate({ id: sessionId }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({
        queryKey: sessionsKey(scope.scopeType, scope.scopeId),
      });
      setActiveId(row.id);
    },
  });

  const resume = useCallback(
    (sessionId: string) => resumption.mutate(sessionId),
    [resumption],
  );

  return {
    tabs,
    activeId,
    select,
    close,
    reopen,
    resume,
    resuming: resumption.isPending ? (resumption.variables ?? null) : null,
    sessions,
  };
}
