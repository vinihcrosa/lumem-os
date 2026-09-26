import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/render.js";
import { trpcMock as trpc } from "../../test/trpc-mock.js";
import { Done } from "./Done.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
});

describe("done", () => {
  const RESULT: Record<string, string> = {
    workspaceId: "w1",
    agentConfigId: "a1",
    projectId: "p1",
    worktreeId: "wt1",
  };

  function done(result: Record<string, string> = RESULT, skipped: string[] = []) {
    const onOpen = vi.fn();
    const onReview = vi.fn();
    renderWithProviders(
      <Done
        result={result}
        skipped={skipped as never[]}
        onOpen={onOpen}
        onReview={onReview}
      />,
    );
    return { onOpen, onReview };
  }

  it("reads the receipt back from the daemon", async () => {
    // Not from what the flow remembers having sent: the interesting case is
    // exactly when the two disagree.
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);
    trpc.agentConfig.list.query.mockResolvedValue([
      {
        id: "a1",
        name: "claude",
        command: "claude-agent-acp",
        transport: "acp",
        adapterVersion: "0.69.0",
        available: true,
      },
    ]);
    trpc.project.get.query.mockResolvedValue({ id: "p1", path: "/repos/lorebase", available: true });
    trpc.worktree.getDetail.query.mockResolvedValue({
      id: "wt1",
      path: "/tmp/lumem/worktrees/lorebase/primeira-tarefa",
      present: true,
    });
    trpc.session.listByScope.query.mockResolvedValue([
      { id: "s1", kind: "agent", state: "running", agentName: "claude" },
    ]);

    done();

    expect(await screen.findByText("pessoal")).toBeInTheDocument();
    expect(await screen.findByText(/claude-agent-acp @0\.69\.0/)).toBeInTheDocument();
    expect(await screen.findByText("/repos/lorebase")).toBeInTheDocument();
    expect(
      await screen.findByText("/tmp/lumem/worktrees/lorebase/primeira-tarefa"),
    ).toBeInTheDocument();
  });

  it("reports what the daemon says is missing from disk", async () => {
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);
    trpc.project.get.query.mockResolvedValue({ id: "p1", path: "/repos/foi", available: false });
    trpc.worktree.getDetail.query.mockResolvedValue({ id: "wt1", path: "/x", present: false });

    done();

    expect((await screen.findAllByText(/não está no disco/)).length).toBeGreaterThan(0);
  });

  it("says a step was skipped, and where it is done later", async () => {
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);

    done({ workspaceId: "w1" }, ["agent", "project", "task"]);

    expect(await screen.findByText(/no rodapé da sidebar, em agentes/)).toBeInTheDocument();
  });

  it("teaches only the shortcut that exists", async () => {
    // The design promised ⌘K, ⌘⇧N and ⌥⇧P. There is one shortcut in this app,
    // and a welcome screen that teaches three that do not exist is the worst
    // lesson possible — the first thing the person tries does not work (O15).
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);

    done();

    // Scoped to the key column: the primary button also carries a ⏎ hint now that
    // Enter is what sends, so a bare text match finds two.
    expect(await screen.findByText("⏎", { selector: ".key__k" })).toBeInTheDocument();
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
    expect(screen.queryByText("⌘⇧N")).not.toBeInTheDocument();
    expect(screen.queryByText("⌥⇧P")).not.toBeInTheDocument();
  });

  it("opens the workspace, or goes back to review", async () => {
    const user = userEvent.setup();
    trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal" }]);
    const { onOpen, onReview } = done();

    await user.click(await screen.findByRole("button", { name: /Abrir o workspace/ }));
    await user.click(screen.getByRole("button", { name: "Revisar a configuração" }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledOnce();
  });
});
