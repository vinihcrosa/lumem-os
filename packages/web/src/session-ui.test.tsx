import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import * as navigation from "./lib/navigation.js";
import { CLAUDE_VIEW, CODEX_VIEW } from "./test/adapter-catalog-fixtures.js";
import { renderWithProviders } from "./test/render.js";
import { trpcMock as trpc } from "./test/trpc-mock.js";

vi.mock("./lib/trpc.js", async () => ({
  trpc: (await import("./test/trpc-mock.js")).trpcMock,
}));

// The terminal has its own tests; here it would only assert that jsdom still
// has no layout.
vi.mock("./features/conversation/Terminal.js", () => ({
  Terminal: ({ sessionId, readOnly }: { sessionId: string; readOnly?: boolean }) => (
    <div data-testid="terminal-mock" data-readonly={readOnly === true ? "true" : undefined}>
      {sessionId}
    </div>
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
    name: "claude",
    command: "claude-agent-acp",
    args: [],
    env: {},
    adapterVersion: "0.75.1",
    retiredAt: null,
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
    // The record survives the tab, which is the whole reason dropping it is
    // safe — and the verb says what comes back is a record (issue #14).
    expect(screen.getByRole("button", { name: /ver registro/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reabrir/ })).not.toBeInTheDocument();
  });

  it("brings an exited session back as a tab on request", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 1 })] : [],
    );

    await openTabs(user);
    await user.click(screen.getByRole("button", { name: /ver registro/ }));

    // Where the output of something that crashed gets read after the fact.
    expect(screen.getByRole("tab", { name: /shell/ })).toBeInTheDocument();
  });

  it("presents the tab of a dead session as a record, not as a terminal", async () => {
    // Issue #14: the reopened tab looked exactly like a live one — same head,
    // same blinking cursor — and typing into it failed in silence.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 1 })] : [],
    );

    await openTabs(user);
    await user.click(screen.getByRole("button", { name: /ver registro/ }));

    expect(screen.getByRole("tab", { name: /registro/ })).toBeInTheDocument();
    const panel = screen.getByRole("tabpanel", { name: /registro de shell/ });
    expect(within(panel).getByText(/somente leitura/)).toBeInTheDocument();
    expect(within(panel).getByTestId("terminal-mock")).toHaveAttribute("data-readonly", "true");
  });

  it("offers the same session again as the way back to working", async () => {
    // The dead process cannot be resumed, so the record says what it is and
    // points at the only thing the daemon can actually do.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 1 })] : [],
    );
    trpc.session.createShell.mutate.mockImplementation(async () => {
      const created = session({ id: "s2" });
      trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
        scopeType === "worktree"
          ? [session({ state: "exited", exitCode: 1 }), created]
          : [],
      );
      return created;
    });

    await openTabs(user);
    await user.click(screen.getByRole("button", { name: /ver registro/ }));
    await user.click(screen.getByRole("button", { name: /nova sessão igual/ }));

    await waitFor(() =>
      expect(trpc.session.createShell.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt1",
      }),
    );
    // The new tab is the one in front, and it is a live terminal.
    const live = await screen.findByRole("tabpanel", { name: "sessão shell" });
    expect(within(live).getByTestId("terminal-mock")).toHaveTextContent("s2");
    expect(within(live).getByTestId("terminal-mock")).not.toHaveAttribute("data-readonly");
  });

  it("lists a legacy terminal agent as history, with nothing to press", async () => {
    // `033` Q3: legado, sem acesso. The row is the record that the session existed —
    // name, state, age —, and every verb that would bring it back is gone: no
    // `ver registro`, no `reabrir`, no `nova sessão igual`. The daemon has not run an
    // agent in a terminal since the migration, and a button here would promise it.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [
            session({
              kind: "agent",
              transport: "pty",
              agentConfigId: "ac-legacy",
              agentName: "claude-code",
              command: "claude",
              state: "exited",
              exitCode: 1,
            }),
          ]
        : [],
    );

    await openTabs(user);

    const panel = screen.getByRole("tabpanel", { name: "teste" });
    const row = within(panel).getByText("claude-code").closest(".item") as HTMLElement;
    expect(row).not.toBeNull();
    expect(within(row).getByText("exited (1)")).toBeInTheDocument();
    expect(row.querySelector(".item__age")?.textContent ?? "").toMatch(/\S/);
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver registro/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reabrir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /claude-code/ })).not.toBeInTheDocument();
  });

  it("still offers to reopen a finished conversation", async () => {
    // The legacy rule is about the terminal agent, not about agents: an ACP
    // session that ended keeps its way back (D13).
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [
            session({
              kind: "agent",
              transport: "acp",
              agentConfigId: "ac1",
              agentName: "claude",
              state: "exited",
              exitCode: 0,
            }),
          ]
        : [],
    );

    await openTabs(user);

    expect(screen.getByRole("button", { name: /reabrir/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver registro/ })).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole("menuitem", { name: /^terminal/ }));

    await waitFor(() =>
      expect(trpc.session.createShell.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt1",
      }),
    );
    expect(await screen.findByTestId("terminal-mock")).toHaveTextContent("s1");
  });

  it("has exactly two verbs: a new agent and a terminal", async () => {
    // `033` F5.6. The menu used to list one line per configuration, which is how
    // the transport leaked into the gesture: choosing an agent was choosing a
    // row of `agent_config`. The adapter and the model are chosen in the pill now.
    const user = userEvent.setup();
    trpc.agentConfig.list.query.mockResolvedValue([
      agentConfig(),
      agentConfig({ id: "ac2", name: "codex", command: "codex-acp" }),
    ]);

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));

    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/novo agente/);
    expect(items[1]).toHaveTextContent(/terminal/);
    expect(screen.queryByRole("menuitem", { name: /codex/ })).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole("menuitem", { name: /^terminal/ }));

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
    await user.click(await screen.findByRole("menuitem", { name: /^terminal/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não está no disco");
  });
});

describe("aba rascunho", () => {
  // `033` T18: `novo agente` não sobe nada mais — nasce um rascunho, sem
  // sessão nenhuma no daemon, e a sessão só nasce no primeiro envio.
  beforeEach(() => {
    trpc.adapterCatalog.list.query.mockResolvedValue([CLAUDE_VIEW, CODEX_VIEW]);
  });

  it("nasce ativa, sem chamar o daemon", async () => {
    const user = userEvent.setup();

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
    await user.click(await screen.findByRole("menuitem", { name: /novo agente/ }));

    const tab = await screen.findByRole("tab", { name: "rascunho" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/Nova conversa em/)).toBeInTheDocument();
    expect(trpc.session.createAgent.mutate).not.toHaveBeenCalled();
    // Regressão (`033` T20): `addDraft()` sem argumento continua nascendo
    // vazio — só a colisão de branch do modal de nova worktree pré-preenche.
    expect(screen.getByPlaceholderText("escreva, ou / para comandos")).toHaveValue("");
  });

  it("manda criar a sessão com o adaptador e o modelo escolhidos, e só depois manda a chegada", async () => {
    const user = userEvent.setup();
    const created = session({
      id: "s9",
      kind: "agent",
      transport: "acp",
      agentConfigId: "ac1",
      agentName: "claude",
    });
    trpc.session.createAgent.mutate.mockImplementation(async () => {
      // Só depois de resolver — antes disso o daemon não tem sessão nenhuma
      // para listar, e assertir "a aba de claude apareceu" tem que provar que
      // a criação de fato aconteceu, e não só que o polling já sabia dela.
      trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
        scopeType === "worktree" ? [created] : [],
      );
      return created;
    });
    const arriveSpy = vi.spyOn(navigation, "arrive");

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
    await user.click(await screen.findByRole("menuitem", { name: /novo agente/ }));
    await user.type(
      screen.getByPlaceholderText("escreva, ou / para comandos"),
      "corrige o login no Safari",
    );
    await user.click(screen.getByRole("button", { name: /enviar/ }));

    await waitFor(() =>
      expect(trpc.session.createAgent.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt1",
        adapterId: "claude",
        config: {},
      }),
    );
    await waitFor(() =>
      expect(arriveSpy).toHaveBeenCalledWith({
        sessionId: "s9",
        text: "corrige o login no Safari",
        send: true,
      }),
    );
    // A ordem, e não só as duas chamadas: `arrive` não tem para quem chegar
    // antes de a sessão existir.
    const createdAt = trpc.session.createAgent.mutate.mock.invocationCallOrder[0] ?? 0;
    const arrivedAt = arriveSpy.mock.invocationCallOrder[0] ?? 0;
    expect(arrivedAt).toBeGreaterThan(createdAt);
    // A aba nascida troca de lugar com o rascunho.
    expect(await screen.findByRole("tab", { name: /claude/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "rascunho" })).not.toBeInTheDocument();

    arriveSpy.mockRestore();
  });

  it("mantém o texto digitado quando criar falha", async () => {
    const user = userEvent.setup();
    trpc.session.createAgent.mutate.mockRejectedValue(
      new Error('o Claude Code não oferece mais "sonnet" em Model — escolha de novo'),
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
    await user.click(await screen.findByRole("menuitem", { name: /novo agente/ }));
    const textarea = screen.getByPlaceholderText("escreva, ou / para comandos");
    await user.type(textarea, "não perca isto");
    await user.click(screen.getByRole("button", { name: /enviar/ }));

    expect(await screen.findByText(/escolha de novo/)).toBeInTheDocument();
    expect(textarea).toHaveValue("não perca isto");
  });

  it("fechar o rascunho não fala nada com o daemon", async () => {
    const user = userEvent.setup();

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /nova sessão/ }));
    await user.click(await screen.findByRole("menuitem", { name: /novo agente/ }));
    await user.type(screen.getByPlaceholderText("escreva, ou / para comandos"), "rascunho descartável");

    await user.click(screen.getByRole("button", { name: "fechar rascunho" }));

    expect(screen.queryByRole("tab", { name: "rascunho" })).not.toBeInTheDocument();
    expect(trpc.session.createAgent.mutate).not.toHaveBeenCalled();
    expect(trpc.session.close.mutate).not.toHaveBeenCalled();
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
