import { useQueries, useQuery } from "@tanstack/react-query";

import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

export type ScopeType = "project" | "worktree";

export interface Scope {
  scopeType: ScopeType;
  scopeId: string;
}

/**
 * The daemon cannot push yet — that lands with T32's subscription. Until then
 * this is the only thing that notices a process dying on its own.
 */
const POLL_MS = 3_000;

function options(scope: Scope) {
  return {
    queryKey: sessionsKey(scope.scopeType, scope.scopeId),
    queryFn: () => trpc.session.listByScope.query(scope),
    refetchInterval: POLL_MS,
  };
}

/**
 * One scope's sessions.
 *
 * Deliberately a hook over a shared query key rather than a fetch inside the
 * list: the tree row that shows "something is running in here" and the list
 * that shows *what* is running are two readers of one fact. Fetching in the
 * list would mean the row could only know while the list is mounted — which is
 * to say, never while the node is folded.
 *
 * The return type is inferred rather than declared. Writing it out means
 * restating the daemon's contract in a second place, and the two drift.
 */
export function useSessionsByScope(scope: Scope) {
  return useQuery(options(scope));
}

/**
 * How many sessions are running across several scopes at once, for a project
 * that has to answer for its worktrees.
 *
 * Same keys as `useSessionsByScope`, so the cache is shared and a worktree row
 * that also asks costs nothing.
 */
export function useRunningAcross(scopes: readonly Scope[]): number {
  return useQueries({
    queries: scopes.map(options),
    combine: (results) =>
      results.reduce(
        (total, result) =>
          total + (result.data ?? []).filter((session) => session.state === "running").length,
        0,
      ),
  });
}
