import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { changesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import type { Scope } from "./useSessionsByScope.js";

export type ChangeRef = "worktree" | "base";

/**
 * Derived from the contract, never redeclared.
 *
 * The ui-shell PRD paid for this lesson once already: a hand-written copy of
 * what a procedure returns drifts, and the drift typechecks.
 */
export type ChangeList = Awaited<ReturnType<typeof trpc.changes.list.query>>;
export type ChangedFile = ChangeList["files"][number];
export type ChangeStatus = ChangedFile["status"];

/**
 * What changed in a checkout — asked once, read twice.
 *
 * The tree paints a status marker per file and the Mudanças tab lists the same
 * files with their counts. Two queries for one question would drift, and the
 * drift would read as the tree disagreeing with the diff beside it.
 */
export function useCheckoutChanges(
  scope: Scope,
  ref: ChangeRef = "worktree",
): UseQueryResult<ChangeList> {
  return useQuery({
    queryKey: changesKey(scope.scopeType, scope.scopeId, ref),
    queryFn: () =>
      trpc.changes.list.query({ scopeType: scope.scopeType, scopeId: scope.scopeId, ref }),
    // Q6: with no watcher, the window regaining focus is the cheapest signal
    // that an agent may have written something since the last look.
    refetchOnWindowFocus: true,
  });
}

/** The one-letter marker the tree and the list share. */
export function statusMark(status: ChangeStatus): string {
  switch (status) {
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "untracked":
      return "?";
  }
}

/** Which CSS modifier paints it. Renamed borrows modified's amber. */
export function statusTone(status: ChangeStatus): string {
  switch (status) {
    case "added":
      return "a";
    case "deleted":
      return "d";
    case "untracked":
      return "u";
    default:
      return "m";
  }
}
