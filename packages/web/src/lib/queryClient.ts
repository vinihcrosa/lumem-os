import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { describeError, isReportableError, recordError } from "./errorLog.js";

/**
 * One client for the app, with every real failure landing in the error log.
 *
 * The caches' `onError` is the one seam every query and mutation passes through,
 * so capturing here means no call site has to remember to report — a banner is
 * still shown where it helps, but the log gets the error whether or not anyone
 * drew a banner for it. `isReportableError` is what keeps the daemon's ordinary
 * "no" (a path that is not a repo, a worktree off disk) out of a bug log.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!isReportableError(error)) return;
        const described = describeError(error);
        recordError({
          kind: "query",
          label: described.label ?? query.queryKey.join("."),
          message: described.message,
          detail: described.detail,
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!isReportableError(error)) return;
        const described = describeError(error);
        recordError({
          kind: "mutation",
          label: described.label ?? (mutation.options.mutationKey?.join(".") ?? "—"),
          message: described.message,
          detail: described.detail,
        });
      },
    }),
    defaultOptions: {
      queries: {
        // The daemon is local. A failed call means it is down, and retrying
        // three times just delays showing that.
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}
