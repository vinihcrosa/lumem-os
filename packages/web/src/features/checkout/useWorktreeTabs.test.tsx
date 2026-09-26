import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trpc } from "../../lib/trpc.js";
import { useWorktreeTabs } from "./useWorktreeTabs.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-proxy.js")).createTrpcProxy(),
}));

/**
 * As abas e a conta (`034` T15): o rótulo da conta chega à aba só quando o
 * agente tem mais de uma, *continuar em outra conta* abre a aba nova, e a linha
 * de vínculo leva à outra aba quando ela é deste escopo.
 */

const SCOPE = { scopeType: "worktree" as const, scopeId: "wt1" };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    kind: "agent",
    state: "running",
    exitCode: null,
    command: "claude-agent-acp",
    transport: "acp",
    agentName: "claude",
    agentAccountId: "acct_pessoal",
    agentAccountLabel: "pessoal",
    multiAccount: false,
    continuedFromId: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("a aba e a conta", () => {
  it("leva o rótulo da conta só quando o agente tem mais de uma", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([
      row(),
      row({ id: "s2", agentAccountId: "acct_trabalho", agentAccountLabel: "trabalho", multiAccount: true }),
    ] as never);

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });

    await waitFor(() => expect(result.current.tabs).toHaveLength(2));
    expect(result.current.tabs[0]).toMatchObject({ accountLabel: null, accountId: "acct_pessoal" });
    expect(result.current.tabs[1]).toMatchObject({ accountLabel: "trabalho", accountId: "acct_trabalho" });
  });
});

describe("o rótulo da aba", () => {
  /*
   * Duas conversas do mesmo agente em contas diferentes eram `claude` e
   * `claude 2` — a aba não dizia a conta que o cabeçalho diz. Com o agente em
   * mais de uma conta, a aba é `agente · conta`, e a numeração dos homônimos
   * conta o rótulo inteiro.
   */
  it("com o agente em mais de uma conta, a aba diz a conta, e contas diferentes não numeram", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([
      row({ multiAccount: true }),
      row({ id: "s2", agentAccountId: "acct_trabalho", agentAccountLabel: "trabalho", multiAccount: true }),
    ] as never);

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });

    await waitFor(() => expect(result.current.tabs).toHaveLength(2));
    expect(result.current.tabs.map((tab) => [tab.label, tab.ordinal])).toEqual([
      ["claude · pessoal", undefined],
      ["claude · trabalho", undefined],
    ]);
    // O cabeçalho junta a conta sozinho: ele recebe o nome do agente, e não o da aba.
    expect(result.current.tabs[1]).toMatchObject({ agentName: "claude", accountLabel: "trabalho" });
  });

  it("duas conversas na mesma conta numeram pelo rótulo inteiro", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([
      row({ agentAccountLabel: "trabalho", multiAccount: true }),
      row({ id: "s2", agentAccountLabel: "trabalho", multiAccount: true }),
      row({ id: "s3", agentAccountLabel: "pessoal", multiAccount: true }),
    ] as never);

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });

    await waitFor(() => expect(result.current.tabs).toHaveLength(3));
    expect(result.current.tabs.map((tab) => [tab.label, tab.ordinal])).toEqual([
      ["claude · trabalho", undefined],
      ["claude · trabalho", 2],
      ["claude · pessoal", undefined],
    ]);
  });

  it("com uma conta só, a aba é o nome do agente, como antes", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([row(), row({ id: "s2" })] as never);

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });

    await waitFor(() => expect(result.current.tabs).toHaveLength(2));
    expect(result.current.tabs.map((tab) => [tab.label, tab.ordinal])).toEqual([
      ["claude", undefined],
      ["claude", 2],
    ]);
  });
});

describe("continuar em outra conta", () => {
  it("manda a sessão e a conta, e abre a aba nova depois de a lista saber dela", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([row()] as never);
    vi.mocked(trpc.session.continueIn.mutate).mockImplementation(async () => {
      vi.mocked(trpc.session.listByScope.query).mockResolvedValue([
        row(),
        row({ id: "s9", agentAccountId: "acct_trabalho", continuedFromId: "s1" }),
      ] as never);
      return row({ id: "s9" }) as never;
    });

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });
    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    act(() => result.current.continueIn("s1", "acct_trabalho"));

    await waitFor(() =>
      expect(trpc.session.continueIn.mutate).toHaveBeenCalledWith({ sessionId: "s1", agentAccountId: "acct_trabalho" }),
    );
    await waitFor(() => expect(result.current.activeId).toBe("s9"));
    expect(result.current.tabs.map((tab) => tab.sessionId)).toEqual(["s1", "s9"]);
  });

  it("a recusa do daemon fica com a sessão de origem", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([row()] as never);
    vi.mocked(trpc.session.continueIn.mutate).mockRejectedValue(new Error("nada foi dito nesta conversa ainda"));

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });
    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    act(() => result.current.continueIn("s1", "acct_trabalho"));

    await waitFor(() =>
      expect(result.current.continueError).toEqual({ sessionId: "s1", message: "nada foi dito nesta conversa ainda" }),
    );
  });
});

describe("a linha de vínculo", () => {
  it("leva à aba da outra sessão, reabrindo a que já tinha saído", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([
      row(),
      row({ id: "s0", state: "exited" }),
    ] as never);

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });
    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    const open = result.current.linkTo("s0");
    expect(open).not.toBeNull();
    act(() => open!());

    await waitFor(() => expect(result.current.activeId).toBe("s0"));
    expect(result.current.tabs.map((tab) => tab.sessionId)).toContain("s0");
  });

  it("uma sessão de outro escopo não vira link", async () => {
    vi.mocked(trpc.session.listByScope.query).mockResolvedValue([row()] as never);

    const { result } = renderHook(() => useWorktreeTabs(SCOPE), { wrapper });
    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    expect(result.current.linkTo("s-de-outro-lugar")).toBeNull();
  });
});
