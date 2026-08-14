import type { AppRouter } from "@lumem/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

/**
 * Vanilla tRPC client driven by TanStack Query at the call site.
 *
 * The typed client comes from the server's router type, so a procedure
 * signature change breaks the web build rather than failing at runtime.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/trpc" })],
});
