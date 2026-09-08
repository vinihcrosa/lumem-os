import { MutationObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearErrors, errorSnapshot } from "./errorLog.js";
import { createQueryClient } from "./queryClient.js";

beforeEach(() => {
  window.localStorage.clear();
  clearErrors();
});

afterEach(() => {
  window.localStorage.clear();
  clearErrors();
});

describe("the query client feeds the error log", () => {
  it("records a failed query under its key", async () => {
    const client = createQueryClient();

    await client
      .fetchQuery({ queryKey: ["session", "listByScope"], queryFn: () => Promise.reject(new Error("daemon caiu")) })
      .catch(() => {});

    const snapshot = errorSnapshot();
    expect(snapshot[0]).toMatchObject({ kind: "consulta", label: "session.listByScope", message: "daemon caiu" });
  });

  it("records a failed mutation, preferring the tRPC path when there is one", async () => {
    const client = createQueryClient();
    const observer = new MutationObserver(client, {
      mutationFn: () =>
        Promise.reject(Object.assign(new Error("recusado"), { data: { path: "session.resume" } })),
    });

    await observer.mutate().catch(() => {});

    expect(errorSnapshot()[0]).toMatchObject({ kind: "ação", label: "session.resume", message: "recusado" });
  });
});
