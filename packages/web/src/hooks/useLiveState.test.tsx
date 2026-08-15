import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateFor, useLiveState, type LumemEvent } from "./useLiveState.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

function Probe() {
  useLiveState();
  return null;
}

function renderProbe() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const result = render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  // The mock is typed as taking no arguments; the real link passes handlers as
  // the second one, and this is the only place that has to know that.
  const [, handlers] = trpc.events.onChange.subscribe.mock.calls[0] as unknown as [
    unknown,
    {
      onData: (event: LumemEvent) => void;
      onConnectionStateChange: (state: { state: string }) => void;
    },
  ];
  return { ...result, queryClient, invalidate, handlers };
}

beforeEach(() => {
  vi.resetAllMocks();
  trpc.events.onChange.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
});

describe("invalidateFor", () => {
  const cases: [LumemEvent, unknown][] = [
    [{ type: "workspace.changed" }, ["workspace", "list"]],
    [{ type: "project.changed", workspaceId: "w1" }, ["project", "listByWorkspace", "w1"]],
    [{ type: "worktree.changed", projectId: "p1" }, ["worktree", "listByProject", "p1"]],
    [
      { type: "session.changed", scopeType: "worktree", scopeId: "wt1" },
      ["session", "listByScope", "worktree", "wt1"],
    ],
  ];

  it.each(cases)("refetches the list %j names", (event, expected) => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    invalidateFor(queryClient, event);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: expected });
  });

  it("also refetches the detail beside the list", () => {
    // A panel that quietly disagrees with the tree next to it is worse than a
    // stale one: it looks authoritative.
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    invalidateFor(queryClient, { type: "worktree.changed", projectId: "p1" });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["worktree"] });
  });
});

describe("useLiveState", () => {
  it("subscribes once", () => {
    renderProbe();

    expect(trpc.events.onChange.subscribe).toHaveBeenCalledTimes(1);
  });

  it("refetches what an incoming event names", () => {
    const { invalidate, handlers } = renderProbe();

    handlers.onData({ type: "workspace.changed" });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["workspace", "list"] });
  });

  it("refetches everything when the stream (re)connects", () => {
    // Events during a gap are gone for good — the daemon does not replay.
    const { invalidate, handlers } = renderProbe();

    handlers.onConnectionStateChange({ state: "idle" });

    expect(invalidate).toHaveBeenCalledWith();
  });

  it("does not resync while it is still reconnecting", () => {
    const { invalidate, handlers } = renderProbe();

    handlers.onConnectionStateChange({ state: "connecting" });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    // One leaked stream per mount would be one open request per navigation.
    const unsubscribe = vi.fn();
    trpc.events.onChange.subscribe.mockReturnValue({ unsubscribe });
    const { unmount } = renderProbe();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
