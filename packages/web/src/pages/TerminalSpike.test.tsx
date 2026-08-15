import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trpc } from "../lib/trpc.js";
import { renderWithProviders } from "../test/render.js";
import { TerminalSpike } from "./TerminalSpike.js";

vi.mock("../lib/trpc.js", () => ({
  trpc: {
    pty: {
      list: { query: vi.fn() },
      spawnShell: { mutate: vi.fn() },
      close: { mutate: vi.fn() },
    },
  },
}));

// The terminal itself is covered by its own tests, and rendering xterm here
// would only assert that jsdom still has no layout.
vi.mock("../components/Terminal.js", () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="terminal-mock">{sessionId}</div>
  ),
}));

const list = vi.mocked(trpc.pty.list.query);
const spawnShell = vi.mocked(trpc.pty.spawnShell.mutate);
const close = vi.mocked(trpc.pty.close.mutate);

function session(id: string, state: "running" | "exited" = "running") {
  return {
    id,
    command: "/bin/zsh",
    args: ["-l"],
    cwd: "/home/vinicius",
    state,
    exitCode: null,
    signal: null,
    cols: 80,
    rows: 24,
  };
}

beforeEach(() => {
  list.mockReset();
  spawnShell.mockReset();
  close.mockReset();
});

describe("TerminalSpike", () => {
  it("says so when there is nothing running", async () => {
    list.mockResolvedValue([]);

    renderWithProviders(<TerminalSpike />);

    expect(await screen.findByText("nenhuma sessão")).toBeInTheDocument();
  });

  it("lists the live sessions", async () => {
    list.mockResolvedValue([session("a"), session("b", "exited")]);

    renderWithProviders(<TerminalSpike />);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("exited");
  });

  it("opens a shell and shows its terminal", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([]);
    spawnShell.mockImplementation(async () => {
      list.mockResolvedValue([session("new-one")]);
      return session("new-one");
    });

    renderWithProviders(<TerminalSpike />);
    await user.click(await screen.findByRole("button", { name: "novo shell" }));

    expect(await screen.findByTestId("terminal-mock")).toHaveTextContent("new-one");
  });

  it("shows the daemon's own words when the spawn fails", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([]);
    spawnShell.mockRejectedValue(new Error("working directory does not exist: /gone"));

    renderWithProviders(<TerminalSpike />);
    await user.click(await screen.findByRole("button", { name: "novo shell" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "working directory does not exist: /gone",
    );
  });

  it("switches between sessions without asking the daemon to close anything", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([session("a"), session("b")]);

    renderWithProviders(<TerminalSpike />);
    const items = await screen.findAllByRole("listitem");
    await user.click(within(items[0]!).getByRole("button", { name: /running/ }));
    await waitFor(() => expect(screen.getByTestId("terminal-mock")).toHaveTextContent("a"));

    await user.click(within(items[1]!).getByRole("button", { name: /running/ }));

    await waitFor(() => expect(screen.getByTestId("terminal-mock")).toHaveTextContent("b"));
    // Switching is a view change. Killing the previous session here would be
    // the exact bug the whole architecture exists to avoid.
    expect(close).not.toHaveBeenCalled();
  });

  it("closes a session on request", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue([session("a")]);
    close.mockResolvedValue({ ok: true });

    renderWithProviders(<TerminalSpike />);
    await user.click(await screen.findByRole("button", { name: "fechar a" }));

    expect(close).toHaveBeenCalledWith({ id: "a" });
  });
});
