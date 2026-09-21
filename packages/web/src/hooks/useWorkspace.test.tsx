import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateWorkspace, useWorkspaceMutations } from "./useWorkspace.js";
import { tasksKey, taskSettingsKey, WORKSPACES_KEY } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-proxy.js")).createTrpcProxy(),
}));

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useCreateWorkspace", () => {
  it("invalida `WORKSPACES_KEY` uma vez", async () => {
    vi.mocked(trpc.workspace.create.mutate).mockResolvedValue({ id: "ws1", name: "x" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateWorkspace(), { wrapper: wrapperFor(queryClient) });
    result.current.mutate("x");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: WORKSPACES_KEY });
  });
});

describe("useWorkspaceMutations", () => {
  it.each([
    ["rename", () => trpc.workspace.rename.mutate, (m: ReturnType<typeof useWorkspaceMutations>) => m.rename.mutate("novo")],
    ["remove", () => trpc.workspace.remove.mutate, (m: ReturnType<typeof useWorkspaceMutations>) => m.remove.mutate()],
  ] as const)("`%s` invalida `WORKSPACES_KEY`", async (_name, mockOf, fire) => {
    vi.mocked(mockOf()).mockResolvedValue({} as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorkspaceMutations("ws1"), {
      wrapper: wrapperFor(queryClient),
    });
    fire(result.current);

    await waitFor(() => expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: WORKSPACES_KEY }));
  });

  it.each([
    ["setAutonomy", () => trpc.workspace.setAutonomy.mutate, (m: ReturnType<typeof useWorkspaceMutations>) => m.setAutonomy.mutate({ autonomy: "manual", maxParallel: 1 })],
    ["setCleanup", () => trpc.workspace.setCleanup.mutate, (m: ReturnType<typeof useWorkspaceMutations>) => m.setCleanup.mutate(true)],
    ["setBudget", () => trpc.workspace.setBudget.mutate, (m: ReturnType<typeof useWorkspaceMutations>) => m.setBudget.mutate({ costPerTask: null, costPerDay: null, turnsPerSession: null })],
  ] as const)("`%s` invalida taskSettingsKey e tasksKey, não WORKSPACES_KEY", async (_name, mockOf, fire) => {
    vi.mocked(mockOf()).mockResolvedValue({} as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorkspaceMutations("ws1"), {
      wrapper: wrapperFor(queryClient),
    });
    fire(result.current);

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskSettingsKey("ws1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: tasksKey("ws1") });
  });
});
