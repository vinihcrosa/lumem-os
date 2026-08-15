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

/** Opens a session from the tab strip of the selected worktree. */
async function openTabs(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await selectWorktree(user);
  await screen.findByRole("tablist");
}

describe("sessões como abas", () => {
  it("puts each live session in a tab and tells shell from agent", async () => {
    // F3.4 asks for a glance. The glyph is the mark; the tab is where it lives
    // now that the tree stops at the worktree.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [session(), session({ id: "s2", kind: "agent", agentName: "claude-code" })]
        : [],
    );

    await openTabs(user);

    expect(screen.getByRole("tab", { name: /shell/ })).toHaveTextContent("●");
    expect(screen.getByRole("tab", { name: /claude-code/ })).toHaveTextContent("◆");
  });

  it("leaves the sidebar with no session rows at all", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session()] : [],
    );

    await openTabs(user);

    const tree = screen.getByLabelText("árvore de projetos");
    expect(within(tree).queryByRole("button", { name: "shell" })).not.toBeInTheDocument();
  });

  it("counts the running sessions on the worktree row", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [session(), session({ id: "s2", kind: "agent", agentName: "claude-code" })]
        : [],
    );

    await openTabs(user);

    const tree = screen.getByLabelText("árvore de projetos");
    expect(
      await within(tree).findByRole("button", { name: "teste 2 sessões rodando" }),
    ).toBeInTheDocument();
  });

  it("gives a tab to no session that has already exited", async () => {
    // Decided with the Vinicius: a tab is live work. Dead ones would only ever
    // accumulate.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 0 })] : [],
    );

    await openTabs(user);

    expect(screen.queryByRole("tab", { name: /shell/ })).not.toBeInTheDocument();
    // The record survives the tab, which is the whole reason dropping it is safe.
    expect(screen.getByRole("button", { name: /reabrir/ })).toBeInTheDocument();
  });

  it("brings an exited session back as a tab on request", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 1 })] : [],
    );

    await openTabs(user);
    await user.click(screen.getByRole("button", { name: /reabrir/ }));

    // Where the output of something that crashed gets read after the fact.
    expect(screen.getByRole("tab", { name: /shell/ })).toBeInTheDocument();
  });

  it("tells homonyms apart with an ordinal", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [
            session({ id: "s1", kind: "agent", agentName: "claude-code" }),
            session({ id: "s2", kind: "agent", agentName: "claude-code" }),
          ]
        : [],
    );

    await openTabs(user);

    expect(screen.getByRole("tab", { name: "claude-code" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "claude-code 2" })).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^shell/ }));

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
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
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
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));

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
    const trigger = await screen.findByRole("button", { name: /nova sessão/ });
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
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
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
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^shell/ }));

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
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^shell/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não está no disco");
  });
});

describe("aba de sessão", () => {
  it("shows what was launched and where", async () => {
    // F5.10, now inside the tab rather than on a screen of its own.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session()] : [],
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("tab", { name: /shell/ }));

    const painel = await screen.findByRole("tabpanel", { name: "sessão shell" });
    expect(within(painel).getByText(/\/bin\/zsh/)).toBeInTheDocument();
    expect(within(painel).getByTestId("terminal-mock")).toHaveTextContent("s1");
  });

  it("ends a running session from its own tab", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session()] : [],
    );
    trpc.session.close.mutate.mockResolvedValue({ ok: true as const });

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: "fechar shell" }));

    await waitFor(() => expect(trpc.session.close.mutate).toHaveBeenCalledWith({ id: "s1" }));
  });

  it("refuses to merely hide a running session's tab", async () => {
    // Hiding a tab whose kill then failed would leave a process running with
    // nothing on screen pointing at it.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session()] : [],
    );
    trpc.session.close.mutate.mockRejectedValue(new Error("o daemon recusou"));

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: "fechar shell" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("o daemon recusou");
    expect(screen.getByRole("tab", { name: /shell/ })).toBeInTheDocument();
  });

  it("keeps every tab's terminal mounted while another one is open", async () => {
    // The regression this whole change could most easily cause. Unmounting on
    // switch would reconnect the socket and repaint from the daemon's buffer
    // every time — F5.6 and F5.7 between tabs, not only between screens.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [session(), session({ id: "s2", kind: "agent", agentName: "claude-code" })]
        : [],
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("tab", { name: /shell/ }));
    await user.click(screen.getByRole("tab", { name: /claude-code/ }));

    const mounted = screen.getAllByTestId("terminal-mock").map((node) => node.textContent);
    expect(mounted).toContain("s1");
    expect(mounted).toContain("s2");
  });
});
