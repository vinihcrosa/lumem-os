import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import { DraftAgentTab } from "./features/conversation/index.js";
import { NewWorktreeComposerModal } from "./features/workspace/index.js";
import { clear as clearSelection, select as selectScope, useNavigation } from "./lib/navigation.js";
import { CLAUDE_VIEW, CODEX_NO_LOGIN_VIEW } from "./test/adapter-catalog-fixtures.js";
import { renderWithProviders } from "./test/render.js";
import { installTrpcDefaults, NO_HOST_ORIGINS, trpcMock as trpc } from "./test/trpc-mock.js";

vi.mock("./lib/trpc.js", async () => ({
  trpc: (await import("./test/trpc-mock.js")).trpcMock,
}));

/**
 * Os agentes saíram da sidebar e moram em `/settings` (`039`, LUM-57).
 *
 * O que estes casos guardam é o endereço: o rodapé é do workspace e
 * `agent_config` é da máquina, então conectar, reconectar e cadastrar um ACP de
 * fora do catálogo acontecem na tela de configurações — e o `entrar ↓` da
 * pílula, que desde a `033` não levava a lugar nenhum, leva para lá.
 */

function agentConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "ac1",
    name: "claude-code",
    command: "claude",
    args: [],
    env: {},
    adapterVersion: "0.40.0",
    retiredAt: null,
    available: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  clearSelection();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.workspace.list.query.mockResolvedValue([
    { id: "w1", name: "pessoal", createdAt: new Date(), updatedAt: new Date() },
  ]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
  trpc.project.get.query.mockResolvedValue(null);
  trpc.worktree.listByProject.query.mockResolvedValue([]);
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([agentConfig()]);
  trpc.adapterCatalog.list.query.mockResolvedValue([CLAUDE_VIEW, CODEX_NO_LOGIN_VIEW]);
});

describe("the sidebar footer", () => {
  it("the sidebar footer has no agent in it", async () => {
    const { container } = renderWithProviders(<App />);
    await screen.findByRole("navigation", { name: "Telas" });
    // Uma configuração listada: o antigo rodapé teria desenhado a linha dela.
    await waitFor(() => expect(trpc.agentConfig.list.query).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    const foot = container.querySelector(".sidebar__foot");
    expect(foot).not.toBeNull();
    expect(within(foot as HTMLElement).queryByRole("button", { name: /conectar um agente/ })).toBeNull();
    expect(within(foot as HTMLElement).queryByText("Agentes")).toBeNull();
    expect(within(foot as HTMLElement).queryByText(/nenhum agente conectado/)).toBeNull();
    expect(within(foot as HTMLElement).queryByRole("button", { name: /^claude-code:/ })).toBeNull();
  });

  it("the sidebar footer keeps the credentials", async () => {
    trpc.secrets.list.query.mockResolvedValue([
      { id: "linear", label: "Linear", hint: "chave de API", present: false },
    ]);
    const { container } = renderWithProviders(<App />);

    const foot = await waitFor(() => {
      const found = container.querySelector(".sidebar__foot") as HTMLElement | null;
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

    expect(await within(foot).findByText("Credenciais")).toBeInTheDocument();
  });
});

describe("a tela de configurações", () => {
  it("settings offers the other-ACP drawer", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/settings");
    renderWithProviders(<App />);

    await user.click(await screen.findByRole("button", { name: /outro agente ACP/ }));

    const drawer = screen.getByRole("group", { name: "outro agente ACP" });
    for (const field of ["Nome", "Comando", "Argumentos (opcional)", "Versão do adaptador"]) {
      expect(within(drawer).getByLabelText(field)).toBeInTheDocument();
    }
  });

  it("settings says the agent configuration is the machine's", async () => {
    window.history.replaceState(null, "", "/settings");
    renderWithProviders(<App />);

    const section = (await screen.findByRole("heading", { name: "Agentes" })).closest("section") as HTMLElement;

    expect(section).toHaveTextContent(/da máquina: vale para todo workspace, não para este/);
    expect(section).not.toHaveTextContent(/rodapé/);
  });

  it("the hash scrolls to that agent's section", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, "", "/settings#agent-codex");
    renderWithProviders(<App />);

    const codex = await screen.findByRole("group", { name: /agente Codex/ });

    await waitFor(() => expect(codex).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(codex.firstElementChild);
  });

  it("without a hash nothing is scrolled or focused", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, "", "/settings");
    renderWithProviders(<App />);

    await screen.findByRole("group", { name: /agente Codex/ });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /agente Codex/ })).not.toHaveFocus();
  });
});

function Where() {
  const { selection } = useNavigation();
  return <output data-testid="selection">{selection === null ? "none" : selection.scope.scopeId}</output>;
}

describe("o `entrar ↓` da pílula", () => {
  it("entrar from the draft pill opens settings at that agent", async () => {
    const user = userEvent.setup();
    trpc.adapterCatalog.list.query.mockResolvedValue([CODEX_NO_LOGIN_VIEW]);
    selectScope({ projectId: "p1", scope: { scopeType: "worktree", scopeId: "wt1" } });
    renderWithProviders(
      <>
        <Where />
        <DraftAgentTab
          scope={{ scopeType: "worktree", scopeId: "wt1" }}
          projectId="p1"
          worktreeName="wt1"
          active
          onCreated={() => undefined}
        />
      </>,
    );
    expect(screen.getByTestId("selection")).toHaveTextContent("wt1");

    await user.click(await screen.findByRole("button", { name: /^agente e modelo:/ }));
    await user.click(await screen.findByRole("button", { name: "entrar ↓" }));

    expect(window.location.pathname).toBe("/settings");
    expect(window.location.hash).toBe("#agent-codex");
    expect(screen.getByTestId("selection")).toHaveTextContent("none");
  });

  it("entrar from the new-worktree composer opens settings and closes it", async () => {
    const user = userEvent.setup();
    trpc.project.listByWorkspace.query.mockResolvedValue([
      {
        id: "p1",
        name: "lumem-os",
        path: "/repo/lumem-os",
        workspaceId: "w1",
        remoteUrl: null,
        managed: false,
        defaultBranch: "main",
        available: true,
        hasCommits: true,
        createdAt: "2026-09-01T00:00:00Z",
      },
    ]);
    trpc.worktree.branches.query.mockResolvedValue([]);
    trpc.worktree.hostOrigins.query.mockResolvedValue(NO_HOST_ORIGINS);
    trpc.adapterCatalog.list.query.mockResolvedValue([CODEX_NO_LOGIN_VIEW]);
    const onClose = vi.fn();
    renderWithProviders(
      <NewWorktreeComposerModal
        workspaceId="w1"
        projectId="p1"
        onClose={onClose}
        onCreated={() => undefined}
        onOpenExisting={() => undefined}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /^agente e modelo:/ }));
    await user.click(await screen.findByRole("button", { name: "entrar ↓" }));

    expect(window.location.pathname).toBe("/settings");
    expect(window.location.hash).toBe("#agent-codex");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
