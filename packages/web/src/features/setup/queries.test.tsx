import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateFirstWorktree, useSetupPreflight } from "./queries.js";
import { sessionsKey, worktreesKey } from "../../lib/queryKeys.js";
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

describe("useSetupPreflight", () => {
  it("lê `setup.preflight`", async () => {
    const report = { checks: [], paths: { databasePath: "d", workspacesDir: "w", transcriptsDir: "t" } };
    vi.mocked(trpc.setup.preflight.query).mockResolvedValue(report as never);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useSetupPreflight(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual(report));
  });
});

describe("useCreateFirstWorktree", () => {
  it("cria só a worktree quando não há agente, e não chama session.createAgent", async () => {
    vi.mocked(trpc.worktree.create.mutate).mockResolvedValue({ id: "wt1", name: "primeira-tarefa" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateFirstWorktree(), { wrapper: wrapperFor(queryClient) });
    result.current.mutate({ projectId: "p1", name: "primeira-tarefa" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trpc.session.createAgent.mutate).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ worktree: { id: "wt1", name: "primeira-tarefa" }, sessionId: undefined });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: worktreesKey("p1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionsKey("worktree", "wt1") });
  });

  it("abre a sessão junto quando um agente é dado", async () => {
    vi.mocked(trpc.worktree.create.mutate).mockResolvedValue({ id: "wt1", name: "primeira-tarefa" } as never);
    vi.mocked(trpc.session.createAgent.mutate).mockResolvedValue({ id: "s1" } as never);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useCreateFirstWorktree(), { wrapper: wrapperFor(queryClient) });
    result.current.mutate({ projectId: "p1", name: "primeira-tarefa", agentConfigId: "a1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trpc.session.createAgent.mutate).toHaveBeenCalledWith({
      scopeType: "worktree",
      scopeId: "wt1",
      agentConfigId: "a1",
    });
    expect(result.current.data?.sessionId).toBe("s1");
  });
});
