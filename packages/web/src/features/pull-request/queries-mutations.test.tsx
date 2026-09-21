import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePullRequestMutations } from "./queries.js";
import { CHANGES_PREFIX, PR_PREFIX, WORKTREE_PREFIX } from "../../lib/queryKeys.js";
import { trpc } from "../../lib/trpc.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-proxy.js")).createTrpcProxy(),
}));

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("usePullRequestMutations", () => {
  it.each([
    ["merge", () => trpc.pr.merge.mutate, (m: ReturnType<typeof usePullRequestMutations>) =>
      m.merge.mutate({ worktreeId: "wt1", strategy: "squash", deleteBranch: false })],
    ["create", () => trpc.pr.create.mutate, (m: ReturnType<typeof usePullRequestMutations>) =>
      m.create.mutate({ worktreeId: "wt1", title: "t", body: "", draft: false })],
  ] as const)("`%s` invalida pr, worktree e changes — as três, uma vez cada", async (_name, mockOf, fire) => {
    vi.mocked(mockOf()).mockResolvedValue({} as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePullRequestMutations(), {
      wrapper: wrapperFor(queryClient),
    });
    fire(result.current);

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: PR_PREFIX });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: WORKTREE_PREFIX });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: CHANGES_PREFIX });
  });
});
