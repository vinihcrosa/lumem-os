import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useBoard,
  useBoardMutations,
  useTaskStatusMutation,
  useWorkOnTaskMutation,
} from "./useTasks.js";
import { boardKey, taskDetailKey, tasksKey, worktreesKey } from "../lib/queryKeys.js";
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

describe("useBoard", () => {
  it("lê `task.board` sob o prefixo do workspace e do projeto", async () => {
    vi.mocked(trpc.task.board.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useBoard("ws1", "p1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(trpc.task.board.query).toHaveBeenCalledWith({ workspaceId: "ws1", projectId: "p1" });
    expect(queryClient.getQueryData(boardKey("ws1", "p1"))).toEqual([]);
  });
});

describe("useBoardMutations", () => {
  it.each([
    ["move", () => trpc.task.move.mutate, (m: ReturnType<typeof useBoardMutations>) => m.move.mutate({ id: "t1", status: "open", index: 0 })],
    ["stop", () => trpc.task.stop.mutate, (m: ReturnType<typeof useBoardMutations>) => m.stop.mutate("t1")],
    ["send", () => trpc.task.sendPrepared.mutate, (m: ReturnType<typeof useBoardMutations>) => m.send.mutate("t1")],
    ["takeOver", () => trpc.task.setAutonomy.mutate, (m: ReturnType<typeof useBoardMutations>) => m.takeOver.mutate("t1")],
  ] as const)("`%s` invalida o quadro ao terminar", async (_name, mockOf, fire) => {
    vi.mocked(mockOf()).mockResolvedValue({} as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useBoardMutations("ws1", "p1"), {
      wrapper: wrapperFor(queryClient),
    });
    fire(result.current);

    await waitFor(() => expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: boardKey("ws1", "p1"),
    }));
  });

  it("`finish` invalida o quadro ao terminar, com sucesso ou não", async () => {
    vi.mocked(trpc.task.finish.mutate).mockResolvedValue({ cleanup: { kind: "removed" } } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useBoardMutations("ws1", "p1"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.finish.mutate("t1");

    await waitFor(() => expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: boardKey("ws1", "p1"),
    }));
  });
});

describe("useTaskStatusMutation", () => {
  it("invalida a lista do workspace e o detalhe da tarefa, uma vez cada", async () => {
    vi.mocked(trpc.task.setStatus.mutate).mockResolvedValue({} as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useTaskStatusMutation("ws1", "t1"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate({ status: "done" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: tasksKey("ws1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskDetailKey("t1") });
  });
});

describe("useWorkOnTaskMutation", () => {
  it("cria worktree nova, anexa e abre sessão — e invalida worktrees e o detalhe", async () => {
    vi.mocked(trpc.worktree.create.mutate).mockResolvedValue({ id: "wt1" } as never);
    vi.mocked(trpc.session.createAgent.mutate).mockResolvedValue({ id: "s1" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useWorkOnTaskMutation("t1", "p1", "rascunho"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate({ mode: "new", name: "nova", checkout: null, agentConfigId: "a1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trpc.task.attachWorktree.mutate).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ worktreeId: "wt1", sessionId: "s1", draft: "rascunho" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: worktreesKey("p1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskDetailKey("t1") });
  });

  it("checkout existente: anexa a worktree em vez de criar", async () => {
    vi.mocked(trpc.task.attachWorktree.mutate).mockResolvedValue({} as never);
    vi.mocked(trpc.session.createAgent.mutate).mockResolvedValue({ id: "s1" } as never);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useWorkOnTaskMutation("t1", "p1", ""), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate({ mode: "existing", name: "", checkout: "wt2", agentConfigId: "a1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trpc.worktree.create.mutate).not.toHaveBeenCalled();
    expect(trpc.task.attachWorktree.mutate).toHaveBeenCalledWith({ id: "t1", worktreeId: "wt2" });
  });

  it("recusa sem checkout e sem agente, sem chamar o daemon", async () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useWorkOnTaskMutation("t1", "p1", ""), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate({ mode: "existing", name: "", checkout: null, agentConfigId: "a1" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(trpc.session.createAgent.mutate).not.toHaveBeenCalled();
  });
});
