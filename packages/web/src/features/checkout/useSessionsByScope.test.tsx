import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionMutations, useSessionsByTask } from "./useSessionsByScope.js";
import { sessionsByTaskKey, sessionsKey } from "../../lib/queryKeys.js";
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

describe("useSessionsByTask", () => {
  it("lê `session.listByTask`", async () => {
    vi.mocked(trpc.session.listByTask.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useSessionsByTask("t1"), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(queryClient.getQueryData(sessionsByTaskKey("t1"))).toEqual([]);
  });
});

const SCOPE = { scopeType: "worktree" as const, scopeId: "wt1" };

describe("useSessionMutations", () => {
  it.each([
    ["createShell", () => trpc.session.createShell.mutate, (m: ReturnType<typeof useSessionMutations>) => m.createShell.mutate()],
    ["createAgent", () => trpc.session.createAgent.mutate, (m: ReturnType<typeof useSessionMutations>) => m.createAgent.mutate({ agentConfigId: "a1" })],
    ["close", () => trpc.session.close.mutate, (m: ReturnType<typeof useSessionMutations>) => m.close.mutate("s1")],
  ] as const)("`%s` invalida `sessionsKey(scope)` uma vez", async (_name, mockOf, fire) => {
    vi.mocked(mockOf()).mockResolvedValue({ id: "s1" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSessionMutations(SCOPE), {
      wrapper: wrapperFor(queryClient),
    });
    fire(result.current);

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledExactlyOnceWith({
        queryKey: sessionsKey(SCOPE.scopeType, SCOPE.scopeId),
      }),
    );
  });
});
