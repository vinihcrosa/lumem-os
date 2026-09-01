import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

vi.mock("./Terminal.js", () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => <div>{sessionId}</div>,
}));

/**
 * A coluna do meio é caminho → abas → conteúdo.
 *
 * O que era cabeçalho fixo virou a PRIMEIRA ABA. Esta suíte prova a estrutura;
 * o que a aba mostra por dentro continua sendo provado pelo `worktree-ui`, que
 * é onde branch, caminho e sujeira sempre foram testados — eles se moveram de
 * lugar na tela e não de dono no teste.
 */

const stamps = { createdAt: new Date(), updatedAt: new Date() };

const PROJECT = {
  id: "p1",
  workspaceId: "w1",
  name: "lorebase",
  path: "/repos/lorebase",
  defaultBranch: "main",
  available: true,
  hasCommits: true,
  managed: false,
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

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...WORKTREE,
    baseBranch: "main",
    status: { clean: true, changedFiles: 0 },
    aheadBehind: { ahead: 0, behind: 0 },
    ...overrides,
  };
}

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

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.workspace.list.query.mockResolvedValue([{ id: "w1", name: "pessoal", ...stamps }]);
  trpc.project.listByWorkspace.query.mockResolvedValue([PROJECT]);
  trpc.project.get.query.mockResolvedValue(PROJECT);
  trpc.worktree.listByProject.query.mockResolvedValue([WORKTREE]);
  trpc.worktree.getDetail.query.mockResolvedValue(detail());
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
});

async function selectWorktree(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  renderWithProviders(<App />);
  const tree = await screen.findByLabelText("árvore de projetos");
  await user.click(await within(tree).findByRole("button", { name: /^lorebase/ }));
  await user.click(await within(tree).findByRole("button", { name: /^teste/ }));
}

describe("a worktree como primeira aba", () => {
  it("põe acima da faixa o caminho, e nada mais", async () => {
    // O cabeçalho fixo gastava altura em TODA aba para dizer o que interessa a
    // uma. O que restou acima da faixa navega; o resto virou conteúdo.
    const user = userEvent.setup();
    await selectWorktree(user);

    await screen.findByRole("tablist");
    const title = screen.getByRole("heading", { level: 2, name: /teste/ });
    // O título mora DENTRO do painel da aba do checkout, não acima da faixa.
    expect(within(screen.getByRole("tabpanel", { name: "teste" })).getByRole("heading", {
      level: 2,
      name: /teste/,
    })).toBe(title);
  });

  it("dá a primeira aba ao checkout, com o nome e o glifo do escopo", async () => {
    const user = userEvent.setup();
    await selectWorktree(user);

    const strip = await screen.findByRole("tablist");
    const tabs = within(strip).getAllByRole("tab");
    expect(tabs[0]).toHaveAccessibleName("teste");
    expect(tabs[0]).toHaveTextContent("◇");
  });

  it("não deixa fechar a aba do checkout", async () => {
    // Fechar a worktree dentro da worktree não quer dizer nada.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session()] : [],
    );

    await selectWorktree(user);

    expect(await screen.findByRole("button", { name: "fechar shell" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "fechar teste" })).not.toBeInTheDocument();
  });

  it("é a aba aberta ao entrar no checkout", async () => {
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session()] : [],
    );

    await selectWorktree(user);

    const tab = await screen.findByRole("tab", { name: "teste" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /shell/ })).toHaveAttribute("aria-selected", "false");
  });

  it("recebe a seleção de volta quando a última aba de sessão fecha", async () => {
    // Sem isto, fechar a última sessão deixaria a coluna sem nada em foco.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session({ state: "exited", exitCode: 0 })] : [],
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("button", { name: /ver registro/ }));
    await user.click(await screen.findByRole("tab", { name: /shell/ }));
    expect(screen.getByRole("tab", { name: "teste" })).toHaveAttribute("aria-selected", "false");

    await user.click(screen.getByRole("button", { name: "fechar shell" }));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "teste" })).toHaveAttribute("aria-selected", "true"),
    );
  });

  it("dá ao checkout do projeto a mesma primeira aba, com o glifo dele", async () => {
    // Q5: duas gramáticas para dois checkouts que se alternam na mesma coluna
    // seria a inconsistência que esta estrutura existe para tirar.
    const user = userEvent.setup();
    renderWithProviders(<App />);
    const tree = await screen.findByLabelText("árvore de projetos");
    await user.click(await within(tree).findByRole("button", { name: /^lorebase/ }));

    const strip = await screen.findByRole("tablist");
    const first = within(strip).getAllByRole("tab")[0]!;
    expect(first).toHaveAccessibleName("local");
    expect(first).toHaveTextContent("▭");
    expect(screen.queryByRole("button", { name: "fechar local" })).not.toBeInTheDocument();
  });
});
