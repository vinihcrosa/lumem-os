import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
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
