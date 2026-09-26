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
    expect(snapshot[0]).toMatchObject({ kind: "query", label: "session.listByScope", message: "daemon caiu" });
  });

  it("records a failed mutation, preferring the tRPC path when there is one", async () => {
    const client = createQueryClient();
    const observer = new MutationObserver(client, {
      mutationFn: () =>
        Promise.reject(
          Object.assign(new Error("caiu"), { data: { path: "session.resume", code: "INTERNAL_SERVER_ERROR" } }),
        ),
    });

    await observer.mutate().catch(() => {});

    expect(errorSnapshot()[0]).toMatchObject({ kind: "mutation", label: "session.resume", message: "caiu" });
  });

  it("does not log the daemon's ordinary refusal, so a typo in onboarding is not a bug", async () => {
    // A path that is not a repo answers with a domain error the screen already
    // shows inline. It must not also nurse a badge in the topbar.
    const client = createQueryClient();

    await client
      .fetchQuery({
        queryKey: ["project", "inspect"],
        queryFn: () =>
          Promise.reject(Object.assign(new Error("não é um repositório"), { data: { code: "BAD_REQUEST" } })),
      })
      .catch(() => {});

    expect(errorSnapshot()).toHaveLength(0);
  });
});
