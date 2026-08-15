import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import { renderWithProviders } from "./test/render.js";
import { trpcMock as trpc } from "./test/trpc-mock.js";

vi.mock("./lib/trpc.js", async () => ({
  trpc: (await import("./test/trpc-mock.js")).trpcMock,
}));


beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.workspace.list.query.mockResolvedValue([]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
});

describe("App header", () => {
  it("renders the product name", () => {
    trpc.health.query.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<App />);

    expect(screen.getByRole("heading", { name: "Lumem-OS", level: 1 })).toBeInTheDocument();
  });

  it("keeps the product as the only level-one heading", async () => {
    // The selection gets its own heading in the detail pane. A second `h1`
    // would leave a screen reader with two competing outlines.
    trpc.health.query.mockResolvedValue({ ok: true, version: "1.2.3" });

    renderWithProviders(<App />);

    expect(await screen.findByText("daemon v1.2.3")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows the daemon version once health resolves", async () => {
    trpc.health.query.mockResolvedValue({ ok: true, version: "1.2.3" });

    renderWithProviders(<App />);

    expect(await screen.findByText("daemon v1.2.3")).toBeInTheDocument();
  });

  it("keeps asking, so a daemon that dies mid-session is noticed", async () => {
    // Asked once, "daemon inacessível" is a state the UI can draw and never
    // reach — PRD §8 wants the client to notice the daemon going down while it
    // is open, not only when it was already down at boot.
    vi.useFakeTimers();
    trpc.health.query.mockResolvedValue({ ok: true, version: "1.2.3" });

    renderWithProviders(<App />);
    await vi.waitFor(() => expect(screen.getByText("daemon v1.2.3")).toBeInTheDocument());

    trpc.health.query.mockRejectedValue(new Error("ECONNREFUSED"));
    await vi.advanceTimersByTimeAsync(6_000);

    await vi.waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getByText("daemon inacessível")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("reports the daemon as unreachable when health fails", async () => {
    // The header is the one thing that renders whatever else went wrong, so
    // this is where "the daemon is down" has to show up.
    trpc.health.query.mockRejectedValue(new Error("ECONNREFUSED"));

    renderWithProviders(<App />);

    expect(await screen.findByText("daemon inacessível")).toBeInTheDocument();
  });
});
