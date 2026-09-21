import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProjectMutations, useProjects } from "./useProjects.js";
import { cloneJobsKey, projectsKey } from "../../lib/queryKeys.js";
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

describe("useProjects", () => {
  it("lê `project.listByWorkspace` sob a chave do workspace", async () => {
    vi.mocked(trpc.project.listByWorkspace.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useProjects("ws1"), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(queryClient.getQueryData(projectsKey("ws1"))).toEqual([]);
  });
});

describe("useProjectMutations", () => {
  it("`add` invalida `projectsKey(workspaceId)` uma vez", async () => {
    vi.mocked(trpc.project.add.mutate).mockResolvedValue({ id: "p1", path: "/x" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectMutations("ws1"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.add.mutate({ path: "/x" });

    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: projectsKey("ws1") });
  });

  it("`clone` invalida `cloneJobsKey(workspaceId)`, não `projectsKey`", async () => {
    vi.mocked(trpc.project.clone.mutate).mockResolvedValue({ id: "job1" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectMutations("ws1"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.clone.mutate({ source: "git@x:y.git" });

    await waitFor(() => expect(result.current.clone.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: cloneJobsKey("ws1") });
  });

  it("`remove` invalida `projectsKey(workspaceId)` uma vez", async () => {
    vi.mocked(trpc.project.remove.mutate).mockResolvedValue({ ok: true } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectMutations("ws1"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.remove.mutate("p1");

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: projectsKey("ws1") });
  });

  it("`invalidateProjects` invalida a lista sem passar por uma mutação", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjectMutations("ws1"), {
      wrapper: wrapperFor(queryClient),
    });
    await result.current.invalidateProjects();

    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: projectsKey("ws1") });
  });
});
