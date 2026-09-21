import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSecretMutations, useSecrets } from "./useSecrets.js";
import { secretsKey } from "../lib/queryKeys.js";
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

describe("useSecrets", () => {
  it("lê `secrets.list`", async () => {
    vi.mocked(trpc.secrets.list.query).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useSecrets(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(queryClient.getQueryData(secretsKey())).toEqual([]);
  });
});

describe("useSecretMutations", () => {
  it("`set` invalida `secretsKey()` uma vez", async () => {
    vi.mocked(trpc.secrets.set.mutate).mockResolvedValue({ ok: true } as never);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSecretMutations(), { wrapper: wrapperFor(queryClient) });
    result.current.set.mutate({ id: "linear", value: "sk-x" });

    await waitFor(() => expect(result.current.set.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: secretsKey() });
  });
});
