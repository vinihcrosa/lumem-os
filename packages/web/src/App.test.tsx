import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import { trpc } from "./lib/trpc.js";
import { renderWithProviders } from "./test/render.js";

vi.mock("./lib/trpc.js", () => ({
  trpc: { health: { query: vi.fn() } },
}));

const healthQuery = vi.mocked(trpc.health.query);

beforeEach(() => {
  healthQuery.mockReset();
});

describe("App", () => {
  it("renders the product name", () => {
    healthQuery.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<App />);

    expect(screen.getByRole("heading", { name: "Lumem-OS" })).toBeInTheDocument();
  });

  it("shows the daemon version once health resolves", async () => {
    healthQuery.mockResolvedValue({ ok: true, version: "1.2.3" });
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByText("daemon v1.2.3")).toBeInTheDocument();
    });
  });

  it("reports the daemon as unreachable when the call fails", async () => {
    healthQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("daemon unreachable");
    });
  });
});
