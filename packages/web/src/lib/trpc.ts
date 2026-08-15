import type { AppRouter } from "@lumem/server/router-types";
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
  type TRPCClient,
} from "@trpc/client";

/**
 * Vanilla tRPC client driven by TanStack Query at the call site.
 *
 * The return type is annotated explicitly rather than inferred: the inferred
 * type reaches into the server package's internals, which the web package
 * cannot name when emitting declarations (TS2742).
 */
export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      // Subscriptions are a long-lived stream, so they cannot share the
      // batching link: one open request would hold a batch open forever.
      condition: (operation) => operation.type === "subscription",
      true: httpSubscriptionLink({ url: "/trpc" }),
      false: httpBatchLink({ url: "/trpc" }),
    }),
  ],
});
