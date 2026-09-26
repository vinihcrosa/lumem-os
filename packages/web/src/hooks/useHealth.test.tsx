import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHealth } from "./useHealth.js";
import { HEALTH_KEY } from "../lib/queryKeys.js";
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

describe("useHealth", () => {
  it("lê `health`", async () => {
    vi.mocked(trpc.health.query).mockResolvedValue({ ok: true, version: "teste" } as never);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useHealth(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual({ ok: true, version: "teste" }));
    expect(queryClient.getQueryData(HEALTH_KEY)).toEqual({ ok: true, version: "teste" });
  });
});
