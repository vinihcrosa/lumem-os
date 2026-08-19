import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Which sessions are blocked waiting on a person.
 *
 * A conversation knows it is blocked; the tab strip above it and the sidebar
 * beside it are the ones that have to say so. Neither is an ancestor of the
 * other, so the fact has to live above both — the same reason `useOpenFiles`
 * exists rather than each pane keeping its own copy.
 *
 * F2.4 and A10: the ask has to be visible from outside the tab it happened in.
 * With `auto` as the default mode it is asked rarely, so a conversation quietly
 * stuck behind a dialog nobody can see is the failure this exists to prevent.
 *
 * A set of ids and nothing else. What is being asked belongs to the conversation
 * that received it; duplicating it here would give two places an answer that can
 * disagree.
 */

export interface AwaitingPermissionValue {
  /** True when that session is waiting on an answer. */
  isWaiting(sessionId: string): boolean;
  /** How many sessions in this list are waiting. */
  countIn(sessionIds: readonly string[]): number;
  /** Reported by the conversation as its own state changes. */
  setWaiting(sessionId: string, waiting: boolean): void;
}

const AwaitingPermissionContext = createContext<AwaitingPermissionValue | null>(null);

export function AwaitingPermissionProvider({ children }: { children: ReactNode }) {
  const [waiting, setWaitingSet] = useState<ReadonlySet<string>>(new Set());

  const setWaiting = useCallback((sessionId: string, next: boolean) => {
    setWaitingSet((current) => {
      if (current.has(sessionId) === next) return current;
      const copy = new Set(current);
      if (next) copy.add(sessionId);
      else copy.delete(sessionId);
      return copy;
    });
  }, []);

  const value = useMemo<AwaitingPermissionValue>(
    () => ({
      isWaiting: (sessionId) => waiting.has(sessionId),
      countIn: (sessionIds) => sessionIds.filter((id) => waiting.has(id)).length,
      setWaiting,
    }),
    [waiting, setWaiting],
  );

  return (
    <AwaitingPermissionContext.Provider value={value}>
      {children}
    </AwaitingPermissionContext.Provider>
  );
}

/**
 * Reads the set, or a no-op when nothing provides it.
 *
 * A no-op rather than a throw: a screen that has no conversations on it has
 * nothing to report, and making every one of them wrap itself in a provider to
 * say so would be ceremony. The one thing that must never happen is a
 * conversation that thinks it reported and did not — and that is a provider the
 * app root installs once, not something a caller can forget per tab.
 */
export function useAwaitingPermission(): AwaitingPermissionValue {
  return (
    useContext(AwaitingPermissionContext) ?? {
      isWaiting: () => false,
      countIn: () => 0,
      setWaiting: () => {},
    }
  );
}
