import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useAdapterCatalog,
  useAgentConfigMutations,
  useAgentConfigs,
  useConnectAgent,
  useCreateHandshakeAgentConfig,
} from "./queries.js";
import { adapterCatalogKey, agentConfigsKey, setupAgentsKey } from "../../lib/queryKeys.js";
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

describe("useAgentConfigs", () => {
  it("lê `agentConfig.list`", async () => {
    vi.mocked(trpc.agentConfig.list.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAgentConfigs(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});

describe("useAdapterCatalog", () => {
  it("lê `adapterCatalog.list` do projeto, sob a chave dele", async () => {
    vi.mocked(trpc.adapterCatalog.list.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAdapterCatalog("p1"), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(trpc.adapterCatalog.list.query).toHaveBeenCalledWith({ projectId: "p1" });
    expect(queryClient.getQueryData(adapterCatalogKey("p1"))).toEqual([]);
  });

  it("sem projeto, não manda `projectId` — os comandos voltam vazios", async () => {
    vi.mocked(trpc.adapterCatalog.list.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAdapterCatalog(null), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(trpc.adapterCatalog.list.query).toHaveBeenCalledWith(undefined);
  });
});

describe("useAgentConfigMutations", () => {
  it("`create` invalida `agentConfigsKey()` uma vez", async () => {
    vi.mocked(trpc.agentConfig.create.mutate).mockResolvedValue({ id: "a1" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAgentConfigMutations(), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.create.mutate({
      name: "claude",
      command: "claude-agent-acp",
      args: [],
      adapterVersion: "1.0.0",
    });

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: agentConfigsKey() });
  });

  it("`remove` invalida `agentConfigsKey()` uma vez", async () => {
    vi.mocked(trpc.agentConfig.remove.mutate).mockResolvedValue({ ok: true } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAgentConfigMutations(), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.remove.mutate("a1");

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: agentConfigsKey() });
  });
});

const PINNED = "1.0.0";
const SPEC = { id: "claude", label: "Claude Code", pinnedVersion: PINNED, cli: null } as never;

describe("useConnectAgent", () => {
  it("não instala quando o adaptador já está na versão fixada", async () => {
    const report = { adapters: [{ id: "claude", adapter: { path: "/bin/claude", version: PINNED } }] };
    vi.mocked(trpc.setup.probe.query).mockResolvedValue({ agentInfo: { version: PINNED } } as never);
    vi.mocked(trpc.agentConfig.create.mutate).mockResolvedValue({ id: "a1" } as never);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useConnectAgent(report as never), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate(SPEC);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trpc.setup.installAdapter.mutate).not.toHaveBeenCalled();
    expect(trpc.agentConfig.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ command: "/bin/claude", adapterVersion: PINNED }),
    );
  });

  it("instala quando a versão detectada diverge do pino (LUM-54)", async () => {
    const report = { adapters: [{ id: "claude", adapter: { path: "/bin/claude", version: "0.9.0" } }] };
    vi.mocked(trpc.setup.installAdapter.mutate).mockResolvedValue({ path: "/bin/claude2" } as never);
    vi.mocked(trpc.setup.probe.query).mockResolvedValue({ agentInfo: { version: PINNED } } as never);
    vi.mocked(trpc.agentConfig.create.mutate).mockResolvedValue({ id: "a1" } as never);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useConnectAgent(report as never), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate(SPEC);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trpc.setup.installAdapter.mutate).toHaveBeenCalledWith({ adapterId: "claude" });
  });

  it("não instala quando a versão não foi lida — não baixa 255 MB num palpite", async () => {
    const report = { adapters: [{ id: "claude", adapter: { path: "/bin/claude", version: null } }] };
    vi.mocked(trpc.setup.probe.query).mockResolvedValue({ agentInfo: { version: PINNED } } as never);
    vi.mocked(trpc.agentConfig.create.mutate).mockResolvedValue({ id: "a1" } as never);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useConnectAgent(report as never), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate(SPEC);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trpc.setup.installAdapter.mutate).not.toHaveBeenCalled();
  });

  it("invalida `agentConfigsKey()` e `setupAgentsKey()` uma vez cada ao terminar", async () => {
    const report = { adapters: [{ id: "claude", adapter: { path: "/bin/claude", version: PINNED } }] };
    vi.mocked(trpc.setup.probe.query).mockResolvedValue({ agentInfo: { version: PINNED } } as never);
    vi.mocked(trpc.agentConfig.create.mutate).mockResolvedValue({ id: "a1" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useConnectAgent(report as never), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate(SPEC);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: agentConfigsKey() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: setupAgentsKey() });
  });

  it("relata a etapa por callback: instalando, depois handshake", async () => {
    const report = { adapters: [{ id: "claude", adapter: { path: null, version: null } }] };
    vi.mocked(trpc.setup.installAdapter.mutate).mockResolvedValue({ path: "/bin/claude" } as never);
    vi.mocked(trpc.setup.probe.query).mockResolvedValue({ agentInfo: { version: PINNED } } as never);
    vi.mocked(trpc.agentConfig.create.mutate).mockResolvedValue({ id: "a1" } as never);
    const queryClient = new QueryClient();
    const stages: string[] = [];

    const { result } = renderHook(() => useConnectAgent(report as never, (stage) => stages.push(stage)), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate(SPEC);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(stages).toEqual(["installing", "handshaking"]);
  });
});

describe("useCreateHandshakeAgentConfig", () => {
  const report = { command: "claude-agent-acp", args: [], agentInfo: { version: PINNED } };

  it("reusa a configuração já existente para o mesmo comando", async () => {
    const already = { id: "a1", command: "claude-agent-acp" };
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useCreateHandshakeAgentConfig([already] as never, "claude"),
      { wrapper: wrapperFor(queryClient) },
    );
    result.current.mutate(report);

    await waitFor(() => expect(result.current.data).toEqual(already));
    expect(trpc.agentConfig.create.mutate).not.toHaveBeenCalled();
  });

  it("recusa sem criar quando o adaptador não declarou versão", async () => {
    // Toda configuração exige a versão desde a `033`, e uma escrita à mão aqui
    // seria uma versão que ninguém mediu.
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useCreateHandshakeAgentConfig([], "claude"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate({ ...report, agentInfo: null });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/não declarou a versão/);
    expect(trpc.agentConfig.create.mutate).not.toHaveBeenCalled();
  });

  it("cria quando não há configuração para o comando, e invalida a lista uma vez", async () => {
    vi.mocked(trpc.agentConfig.create.mutate).mockResolvedValue({ id: "a1" } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateHandshakeAgentConfig([], "claude"), {
      wrapper: wrapperFor(queryClient),
    });
    result.current.mutate(report);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: agentConfigsKey() });
  });
});
