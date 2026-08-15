import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

// The terminal has its own tests; here it would only assert that jsdom still
// has no layout.
vi.mock("./Terminal.js", () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="terminal-mock">{sessionId}</div>
  ),
}));

const stamps = { createdAt: new Date(), updatedAt: new Date() };

const PROJECT = {
  id: "p1",
  workspaceId: "w1",
  name: "lorebase",
  path: "/repos/lorebase",
  defaultBranch: "main",
  available: true,
  ...stamps,
};

const WORKTREE = {
  id: "wt1",
  projectId: "p1",
  name: "teste",
  branch: "teste",
  path: "/home/.lumem/worktrees/lorebase/teste",
  state: "active" as const,
  present: true,
  ...stamps,
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    kind: "shell" as const,
    agentConfigId: null,
    agentName: null,
    scopeType: "worktree" as const,
    scopeId: "wt1",
    cwd: WORKTREE.path,
    command: "/bin/zsh",
    state: "running" as const,
    exitCode: null,
    ...stamps,
    ...overrides,
  };
}

function agentConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "ac1",
    name: "claude-code",
    command: "claude",
    args: [],
    env: {},
    available: true,
    ...stamps,
    ...overrides,
  };
}

/** Opens the app with the worktree selected. */
async function selectWorktree(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  renderWithProviders(<App />);
  const tree = await screen.findByLabelText("árvore de projetos");
  await user.click(await within(tree).findByRole("button", { name: /^lorebase/ }));
  await user.click(await within(tree).findByRole("button", { name: /^teste/ }));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal", ...stamps }]);
  trpc.project.listByWorkspace.query.mockResolvedValue([PROJECT]);
  trpc.project.get.query.mockResolvedValue(PROJECT);
  trpc.worktree.listByProject.query.mockResolvedValue([WORKTREE]);
  trpc.worktree.getDetail.query.mockResolvedValue({
    ...WORKTREE,
    baseBranch: "main",
    status: { clean: true, changedFiles: 0 },
    aheadBehind: { ahead: 0, behind: 0 },
  });
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([agentConfig()]);
});

describe("session list", () => {
  it("shows a worktree's sessions, telling shell and agent apart", async () => {
    // F3.4.
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [session(), session({ id: "s2", kind: "agent", agentName: "claude-code" })]
        : [],
    );

    renderWithProviders(<App />);

    const list = await screen.findByLabelText("árvore de projetos");
    const shell = await within(list).findByRole("button", { name: "shell" });
    const agent = within(list).getByRole("button", { name: "claude-code" });

    // F3.4 asks for a glance, so the mark itself is the requirement — a
    // different glyph, not a different shade of the same one.
    expect(shell).toHaveTextContent("●");
    expect(agent).toHaveTextContent("◆");
  });

  it("marks a session that already ended", async () => {
    // F5.9: it goes quiet, it does not disappear.
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 0 })] : [],
    );

    renderWithProviders(<App />);

    const list = await screen.findByLabelText("árvore de projetos");
    expect(await within(list).findByRole("button", { name: "shell saiu" })).toBeInTheDocument();
  });

  it("keeps saying a session is running after the node is folded", async () => {
    // The reason the sessions query lives in a hook over a shared key instead
    // of inside the list. Folding hides the children; it must not blind the
    // parent, because "something is alive in there" is the sidebar's whole job.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ kind: "agent", agentName: "claude-code" })] : [],
    );

    renderWithProviders(<App />);
    const list = await screen.findByLabelText("árvore de projetos");
    await within(list).findByRole("button", { name: "claude-code" });

    await user.click(within(list).getByRole("button", { name: "recolher teste" }));

    expect(within(list).queryByRole("button", { name: "claude-code" })).not.toBeInTheDocument();
    expect(
      await within(list).findByRole("button", { name: "teste sessão rodando" }),
    ).toBeInTheDocument();
  });

  it("remembers what was folded across a remount", async () => {
    const user = userEvent.setup();

    const first = renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "recolher lorebase" }));
    first.unmount();

    renderWithProviders(<App />);

    expect(await screen.findByRole("button", { name: "expandir lorebase" })).toBeInTheDocument();
  });
});

describe("new session menu", () => {
  it("opens a shell in the worktree and shows its terminal", async () => {
    const user = userEvent.setup();
    trpc.session.createShell.mutate.mockImplementation(async () => {
      const created = session();
      trpc.session.listByScope.query.mockResolvedValue([created]);
      trpc.session.getDetail.query.mockResolvedValue(created);
      return created;
    });

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: "novo shell" }));

    await waitFor(() =>
      expect(trpc.session.createShell.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt1",
      }),
    );
    expect(await screen.findByTestId("terminal-mock")).toHaveTextContent("s1");
  });

  it("offers each available agent configuration", async () => {
    const user = userEvent.setup();
    const created = session({ kind: "agent", agentName: "claude-code", agentConfigId: "ac1" });
    trpc.session.createAgent.mutate.mockImplementation(async () => {
      trpc.session.getDetail.query.mockResolvedValue(created);
      return created;
    });

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /novo agente/ }));
    await user.click(await screen.findByRole("menuitem", { name: /claude-code/ }));

    await waitFor(() =>
      expect(trpc.session.createAgent.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt1",
        agentConfigId: "ac1",
      }),
    );
  });

  it("shows an agent whose command is missing as unavailable, and refuses to launch it", async () => {
    // F6.5. Hiding it leaves the user wondering where their agent went;
    // enabling it lets them watch a terminal open and close for no reason.
    const user = userEvent.setup();
    trpc.agentConfig.list.query.mockResolvedValue([agentConfig({ available: false })]);

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /novo agente/ }));

    const item = await screen.findByRole("menuitem", { name: /claude-code/ });
    expect(item).toBeDisabled();
    // The reason, not just the refusal: "indisponível" leaves the user with
    // nothing to fix.
    expect(item).toHaveTextContent("fora do PATH");
    await user.click(item);
    expect(trpc.session.createAgent.mutate).not.toHaveBeenCalled();
  });

  it("closes the menu with Escape and gives focus back to the trigger", async () => {
    const user = userEvent.setup();

    await selectWorktree(user);
    const trigger = await screen.findByRole("button", { name: /novo agente/ });
    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    // Leaving focus on a button that no longer exists sends the next Tab to
    // the top of the document.
    expect(trigger).toHaveFocus();
  });

  it("closes the menu on a click outside it", async () => {
    const user = userEvent.setup();

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /novo agente/ }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("heading", { name: "Lumem-OS" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("can open a session in the project itself, with no worktree", async () => {
    // F5.2 and decision WS-Q15.
    const user = userEvent.setup();
    trpc.session.createShell.mutate.mockResolvedValue(
      session({ scopeType: "project", scopeId: "p1" }),
    );

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /^lorebase/ }));
    await user.click(await screen.findByRole("button", { name: "novo shell" }));

    await waitFor(() =>
      expect(trpc.session.createShell.mutate).toHaveBeenCalledWith({
        scopeType: "project",
        scopeId: "p1",
      }),
    );
  });

  it("shows the daemon's refusal when a session cannot start", async () => {
    const user = userEvent.setup();
    trpc.session.createShell.mutate.mockRejectedValue(
      new Error('a worktree "teste" não está no disco'),
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: "novo shell" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não está no disco");
  });
});

describe("session detail", () => {
  it("shows kind, scope, command and state", async () => {
    // F5.10.
    const user = userEvent.setup();
    const live = session();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [live] : [],
    );
    trpc.session.getDetail.query.mockResolvedValue(live);

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /shell/ }));

    expect(await screen.findByText("/bin/zsh")).toBeInTheDocument();
    expect(screen.getByText("rodando")).toBeInTheDocument();
    expect(screen.getByText("worktree")).toBeInTheDocument();
  });

  it("keeps the buffer readable after the session ended, with no close button", async () => {
    const user = userEvent.setup();
    const dead = session({ state: "exited", exitCode: 1 });
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [dead] : [],
    );
    trpc.session.getDetail.query.mockResolvedValue(dead);

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /shell/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("a sessão terminou");
    expect(screen.getByTestId("terminal-mock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "encerrar sessão" })).not.toBeInTheDocument();
  });

  it("closes a session on request", async () => {
    const user = userEvent.setup();
    const live = session();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [live] : [],
    );
    trpc.session.getDetail.query.mockResolvedValue(live);
    trpc.session.close.mutate.mockResolvedValue({ ok: true as const });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /shell/ }));
    await user.click(await screen.findByRole("button", { name: "encerrar sessão" }));

    await waitFor(() => expect(trpc.session.close.mutate).toHaveBeenCalledWith({ id: "s1" }));
  });

  it("switches between sessions without closing anything", async () => {
    // F5.6: navigating away is a view change. Closing here would be the exact
    // bug the whole architecture exists to prevent.
    const user = userEvent.setup();
    const first = session();
    const second = session({ id: "s2", kind: "agent", agentName: "claude-code" });
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [first, second] : [],
    );
    trpc.session.getDetail.query.mockImplementation(async ({ id }) =>
      id === "s1" ? first : second,
    );

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /shell/ }));
    await waitFor(() => expect(screen.getByTestId("terminal-mock")).toHaveTextContent("s1"));

    await user.click(screen.getByRole("button", { name: /claude-code/ }));

    await waitFor(() => expect(screen.getByTestId("terminal-mock")).toHaveTextContent("s2"));
    expect(trpc.session.close.mutate).not.toHaveBeenCalled();
  });
});
