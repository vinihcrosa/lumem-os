import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));


function workspace(id: string, name: string) {
  return { id, name, createdAt: new Date(), updatedAt: new Date() };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.workspace.list.query.mockResolvedValue([]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
});

describe("first run", () => {
  it("asks for a workspace and shows nothing else", async () => {
    // PRD §5: "a tela de criação e nada mais". Everything below is scoped to a
    // workspace, so an empty sidebar would present a broken app.
    renderWithProviders(<App />);

    expect(await screen.findByLabelText("Nome do workspace")).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("árvore de projetos")).not.toBeInTheDocument();
  });

  it("creates the first workspace and moves on", async () => {
    const user = userEvent.setup();
    trpc.workspace.create.mutate.mockImplementation(async ({ name }: { name: string }) => {
      const created = workspace("w1", name);
      trpc.workspace.list.query.mockResolvedValue([created]);
      return created;
    });

    renderWithProviders(<App />);
    await user.type(await screen.findByLabelText("Nome do workspace"), "pessoal");
    await user.click(screen.getByRole("button", { name: "criar workspace" }));

    expect(await screen.findByLabelText("Workspace")).toHaveValue("w1");
  });

  it("shows the daemon's refusal instead of failing silently", async () => {
    const user = userEvent.setup();
    trpc.workspace.create.mutate.mockRejectedValue(
      new Error('já existe um workspace chamado "pessoal"'),
    );

    renderWithProviders(<App />);
    await user.type(await screen.findByLabelText("Nome do workspace"), "pessoal");
    await user.click(screen.getByRole("button", { name: "criar workspace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'já existe um workspace chamado "pessoal"',
    );
  });

  it("refuses to submit an empty name without asking the daemon", async () => {
    renderWithProviders(<App />);

    expect(await screen.findByRole("button", { name: "criar workspace" })).toBeDisabled();
    expect(trpc.workspace.create.mutate).not.toHaveBeenCalled();
  });
});

describe("workspace selector", () => {
  it("lists the workspaces and switches the active one", async () => {
    const user = userEvent.setup();
    trpc.workspace.list.query.mockResolvedValue([
      workspace("w1", "pessoal"),
      workspace("w2", "trabalho"),
    ]);

    renderWithProviders(<App />);
    const select = await screen.findByLabelText("Workspace");
    expect(select).toHaveValue("w1");

    await user.selectOptions(select, "w2");

    expect(select).toHaveValue("w2");
    await waitFor(() =>
      expect(trpc.project.listByWorkspace.query).toHaveBeenCalledWith({ workspaceId: "w2" }),
    );
  });

  it("remembers the active workspace across a reload", async () => {
    const user = userEvent.setup();
    trpc.workspace.list.query.mockResolvedValue([
      workspace("w1", "pessoal"),
      workspace("w2", "trabalho"),
    ]);

    const first = renderWithProviders(<App />);
    await user.selectOptions(await screen.findByLabelText("Workspace"), "w2");
    first.unmount();

    renderWithProviders(<App />);

    expect(await screen.findByLabelText("Workspace")).toHaveValue("w2");
  });

  it("falls back when the remembered workspace is gone", async () => {
    // Removed from another tab. Without the fallback the sidebar points at
    // nothing and the only way out is clearing storage by hand.
    window.localStorage.setItem("lumem.activeWorkspaceId", "deleted");
    trpc.workspace.list.query.mockResolvedValue([workspace("w1", "pessoal")]);

    renderWithProviders(<App />);

    expect(await screen.findByLabelText("Workspace")).toHaveValue("w1");
  });

  it("creates another workspace and switches to it", async () => {
    const user = userEvent.setup();
    trpc.workspace.list.query.mockResolvedValue([workspace("w1", "pessoal")]);
    trpc.workspace.create.mutate.mockImplementation(async ({ name }: { name: string }) => {
      const created = workspace("w2", name);
      trpc.workspace.list.query.mockResolvedValue([workspace("w1", "pessoal"), created]);
      return created;
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "novo workspace" }));
    await user.type(screen.getByLabelText("Nome do novo workspace"), "trabalho");
    await user.click(screen.getByRole("button", { name: "criar" }));

    // Creating one and staying on the old one is a surprise every time.
    await waitFor(() => expect(screen.getByLabelText("Workspace")).toHaveValue("w2"));
  });
});
