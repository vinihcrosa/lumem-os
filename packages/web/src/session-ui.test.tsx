import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import * as navigation from "./lib/navigation.js";
import { CLAUDE_VIEW, CODEX_VIEW } from "./test/adapter-catalog-fixtures.js";
import { accountRow } from "./test/agent-account-fixtures.js";
import { renderWithProviders } from "./test/render.js";
import { NO_PENDING_PROMPT, trpcMock as trpc } from "./test/trpc-mock.js";

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

/** A live PTY tab to stand in front of: a shell is not a tab (LUM-62). */
function tabSession(overrides: Record<string, unknown> = {}) {
  return session({ kind: "agent", agentName: "claude-code", ...overrides });
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
  // A `Conversation` de verdade (aba `acp`) lê isto no `mount` desde a `033`
  // T21 — sem prompt pendente é o estado normal de toda conversa.
  trpc.session.getDetail.query.mockResolvedValue(NO_PENDING_PROMPT);
  trpc.agentConfig.list.query.mockResolvedValue([agentConfig()]);
});

/** Opens a session from the tab strip of the selected worktree. */
async function openTabs(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await selectWorktree(user);
  await screen.findByRole("tablist");
}

describe("sessões como abas", () => {
  it("puts each live agent in a tab, and a live shell in none", async () => {
    // F3.4 asks for a glance. The glyph is the mark; the tab is where it lives
    // now that the tree stops at the worktree. A shell lives in the run dock
    // (LUM-62), so it is never drawn here — the same terminal on two surfaces
    // was the defect.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [session(), session({ id: "s2", kind: "agent", agentName: "claude-code" })]
        : [],
    );

    await openTabs(user);

    expect(screen.getByRole("tab", { name: /claude-code/ })).toHaveTextContent("◆");
    expect(screen.queryByRole("tab", { name: /shell/ })).not.toBeInTheDocument();
    // Only the agent's terminal is mounted; the shell's is the dock's to draw.
    expect(screen.getAllByTestId("terminal-mock").map((node) => node.textContent)).toEqual(["s2"]);
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
      scopeType === "worktree" ? [tabSession({ state: "exited", exitCode: 0 })] : [],
    );

    await openTabs(user);

    expect(screen.queryByRole("tab", { name: /claude-code/ })).not.toBeInTheDocument();
  });

  it("lists a dead shell as history, with no way back to a tab it no longer has", async () => {
    // LUM-62: the record is still listed — it happened —, but "ver registro"
    // would reopen a tab that is never drawn, so the verb is gone.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 1 })] : [],
    );

    await openTabs(user);

    expect(screen.getByText("exited (1)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver registro/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /shell/ })).not.toBeInTheDocument();
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

describe("novo agente", () => {
  it("is a button, not a menu — and nothing here opens a shell", async () => {
    // LUM-62. The menu had two verbs, `novo agente` and `terminal` (`033` F5.6);
    // the terminal moved to the run dock, and a menu of one item is a click for
    // nothing. The adapter and the model are chosen in the pill, not here.
    const user = userEvent.setup();
    trpc.adapterCatalog.list.query.mockResolvedValue([CLAUDE_VIEW, CODEX_VIEW]);

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /^novo agente$/ }));

    expect(screen.queryByRole("button", { name: /nova sessão$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /terminal/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "rascunho" })).toBeInTheDocument();
    expect(trpc.session.createShell.mutate).not.toHaveBeenCalled();
  });

  it("can open a draft in the project itself, with no worktree", async () => {
    // F5.2 and decision WS-Q15.
    const user = userEvent.setup();
    trpc.adapterCatalog.list.query.mockResolvedValue([CLAUDE_VIEW, CODEX_VIEW]);

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /^lorebase/ }));
    await user.click(await screen.findByRole("button", { name: /^novo agente$/ }));

    expect(await screen.findByRole("tab", { name: "rascunho" })).toBeInTheDocument();
    expect(trpc.session.createShell.mutate).not.toHaveBeenCalled();
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
    await user.click(await screen.findByRole("button", { name: /^novo agente$/ }));

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
    await user.click(await screen.findByRole("button", { name: /^novo agente$/ }));
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

  it("com duas contas, a escolhida na pílula vai junto no createAgent (`034` T14)", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow(),
      accountRow({ id: "acct_trabalho", label: "trabalho", isDefault: false, bare: false }),
    ]);
    trpc.session.createAgent.mutate.mockResolvedValue(
      session({ id: "s9", kind: "agent", transport: "acp", agentConfigId: "ac1", agentName: "claude" }),
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /^novo agente$/ }));
    await user.click(await screen.findByRole("button", { name: /^agente e modelo:.*pessoal/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "trabalho" }));
    await user.type(screen.getByPlaceholderText("escreva, ou / para comandos"), "oi");
    await user.click(screen.getByRole("button", { name: /enviar/ }));

    await waitFor(() =>
      expect(trpc.session.createAgent.mutate).toHaveBeenCalledWith({
        scopeType: "worktree",
        scopeId: "wt1",
        adapterId: "claude",
        config: {},
        agentAccountId: "acct_trabalho",
      }),
    );
  });

  it("mantém o texto digitado quando criar falha", async () => {
    const user = userEvent.setup();
    trpc.session.createAgent.mutate.mockRejectedValue(
      new Error('o Claude Code não oferece mais "sonnet" em Model — escolha de novo'),
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /^novo agente$/ }));
    const textarea = screen.getByPlaceholderText("escreva, ou / para comandos");
    await user.type(textarea, "não perca isto");
    await user.click(screen.getByRole("button", { name: /enviar/ }));

    expect(await screen.findByText(/escolha de novo/)).toBeInTheDocument();
    expect(textarea).toHaveValue("não perca isto");
  });

  it("fechar o rascunho não fala nada com o daemon", async () => {
    const user = userEvent.setup();

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /^novo agente$/ }));
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
      scopeType === "worktree" ? [tabSession()] : [],
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("tab", { name: /^claude-code/ }));

    const painel = await screen.findByRole("tabpanel", { name: "sessão claude-code" });
    expect(within(painel).getByText(/\/bin\/zsh/)).toBeInTheDocument();
    expect(within(painel).getByTestId("terminal-mock")).toHaveTextContent("s1");
  });

  it("ends a running session from its own tab", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [tabSession()] : [],
    );
    trpc.session.close.mutate.mockResolvedValue({ ok: true as const });

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: "fechar claude-code" }));

    await waitFor(() => expect(trpc.session.close.mutate).toHaveBeenCalledWith({ id: "s1" }));
  });

  it("refuses to merely hide a running session's tab", async () => {
    // Hiding a tab whose kill then failed would leave a process running with
    // nothing on screen pointing at it.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [tabSession()] : [],
    );
    trpc.session.close.mutate.mockRejectedValue(new Error("o daemon recusou"));

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: "fechar claude-code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("o daemon recusou");
    expect(screen.getByRole("tab", { name: /^claude-code/ })).toBeInTheDocument();
  });

  it("shows the daemon's reason when a resume is refused, instead of nothing", async () => {
    // The bug: clicking "retomar" did nothing. The resume launches a fresh adapter
    // and that can be refused, and the refusal had no surface at all — unlike every
    // other session action, which shows the daemon's sentence.
    const user = userEvent.setup();
    const ended = session({
      kind: "agent",
      agentName: "claude-code",
      agentConfigId: "ac1",
      command: "claude-agent-acp",
      transport: "acp",
      acpSessionId: "acp-1",
      state: "exited",
      exitCode: 0,
    });
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [ended] : [],
    );
    // The read path a finished conversation takes when its tab is reopened.
    trpc.session.transcript.query.mockResolvedValue({
      type: "attached",
      sessionId: "s1",
      state: "exited",
      acpSessionId: "acp-1",
      model: "opus",
      mode: "default",
      configOptions: [],
      transcript: [],
    });
    trpc.session.resume.mutate.mockRejectedValue(
      new Error("o adaptador claude-agent-acp não sabe retomar conversa: não declara loadSession"),
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /reabrir/ }));
    await user.click(await screen.findByRole("button", { name: /retomar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não sabe retomar conversa");
  });

  it("keeps a real failure in the topbar's error log, not only in a banner", async () => {
    // The banner is gone the moment you look away. The log is what survives, so a
    // real bug can be copied out later — and it is fed by the same failed call.
    // A server defect (INTERNAL_SERVER_ERROR), not a domain refusal: the log is
    // for bugs, and the daemon's ordinary "no" stays out of it.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [tabSession()] : [],
    );
    trpc.session.close.mutate.mockRejectedValue(
      Object.assign(new Error("o daemon caiu ao fechar"), { data: { code: "INTERNAL_SERVER_ERROR" } }),
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: "fechar claude-code" }));

    const trigger = await screen.findByRole("button", { name: /registro de erros/ });
    await user.click(trigger);
    expect(within(screen.getByRole("dialog")).getByText("o daemon caiu ao fechar")).toBeInTheDocument();
  });

  it("keeps every tab's terminal mounted while another one is open", async () => {
    // The regression this whole change could most easily cause. Unmounting on
    // switch would reconnect the socket and repaint from the daemon's buffer
    // every time — F5.6 and F5.7 between tabs, not only between screens.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree"
        ? [tabSession(), tabSession({ id: "s2", agentName: "codex" })]
        : [],
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("tab", { name: /^claude-code/ }));
    await user.click(screen.getByRole("tab", { name: /codex/ }));

    const mounted = screen.getAllByTestId("terminal-mock").map((node) => node.textContent);
    expect(mounted).toContain("s1");
    expect(mounted).toContain("s2");
  });
});
