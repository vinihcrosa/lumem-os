import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorktreeMutations, useWorktrees } from "./useWorktrees.js";
import { worktreesKey } from "../../lib/queryKeys.js";
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

describe("useWorktrees", () => {
  it("lê `worktree.listByProject` sob a chave do projeto", async () => {
    vi.mocked(trpc.worktree.listByProject.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useWorktrees("p1"), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(queryClient.getQueryData(worktreesKey("p1"))).toEqual([]);
  });

  it("respeita `enabled: false`", () => {
    const queryClient = new QueryClient();
    renderHook(() => useWorktrees("p1", { enabled: false }), { wrapper: wrapperFor(queryClient) });
    expect(trpc.worktree.listByProject.query).not.toHaveBeenCalled();
  });
});

describe("useWorktreeMutations", () => {
  it("`create` manda `projectId` fixo e invalida `worktreesKey(projectId)` uma vez", async () => {
    vi.mocked(trpc.worktree.create.mutate).mockResolvedValue({ id: "wt1" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorktreeMutations("p1"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.create.mutate({ name: "nova" });

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(trpc.worktree.create.mutate).toHaveBeenCalledWith({ projectId: "p1", name: "nova" });
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: worktreesKey("p1") });
  });

  it("`remove` invalida `worktreesKey(projectId)` uma vez", async () => {
    vi.mocked(trpc.worktree.remove.mutate).mockResolvedValue({ ok: true } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorktreeMutations("p1"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.remove.mutate({ id: "wt1", force: false });

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: worktreesKey("p1") });
  });
});
