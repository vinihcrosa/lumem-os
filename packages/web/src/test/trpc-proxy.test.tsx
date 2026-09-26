import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createTrpcProxy } from "./trpc-proxy.js";

/**
 * O proxy da fase 3 (`032` T10) — o mock de transporte que um hook consome.
 *
 * O caso que prova o mecanismo inteiro: `mockResolvedValue` num caminho de
 * dois níveis (`health.query`) alcança a chamada que um `useQuery` real faz
 * pelo mesmo caminho, mesmo os dois vindo de travessias `.` diferentes.
 */
describe("createTrpcProxy", () => {
  it("mockResolvedValue num caminho alcança quem chama o mesmo caminho", async () => {
    const trpcProxy = createTrpcProxy();
    vi.mocked(trpcProxy.health.query).mockResolvedValue({ ok: true, version: "teste" });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(
      () => useQuery({ queryKey: ["health"], queryFn: () => trpcProxy.health.query() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual({ ok: true, version: "teste" }));
  });

  it("dois acessos ao mesmo caminho devolvem o mesmo mock", () => {
    const trpcProxy = createTrpcProxy();
    expect(trpcProxy.agentConfig.list.query).toBe(trpcProxy.agentConfig.list.query);
  });

  it("um caminho que o router não tem é erro de tipo", () => {
    const trpcProxy = createTrpcProxy();
    // @ts-expect-error — `naoExiste` não está em `AppRouter`.
    void trpcProxy.naoExiste;
  });
});
