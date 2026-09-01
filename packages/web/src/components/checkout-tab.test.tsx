import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

vi.mock("./Terminal.js", () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="terminal-mock">{sessionId}</div>
  ),
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

describe("o interruptor da coluna de arquivos", () => {
  it("mora na faixa de abas do checkout, e não na topbar", async () => {
    // A coluna é de um checkout. Um interruptor global para algo que só existe
    // dentro de um escopo diz, por estar lá, que ele é do produto.
    const user = userEvent.setup();
    await selectWorktree(user);

    const strip = await screen.findByRole("tablist");
    expect(
      within(strip).getByRole("button", { name: "abrir a coluna de arquivos" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).queryByRole("button", { name: /arquivos/ }),
    ).not.toBeInTheDocument();
  });

  it("continua alcançável com a coluna fechada, que é o único jeito de reabrir", async () => {
    const user = userEvent.setup();
    await selectWorktree(user);

    await user.click(await screen.findByRole("button", { name: "abrir a coluna de arquivos" }));
    expect(await screen.findByLabelText("arquivos do checkout")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "fechar a coluna de arquivos" }));
    expect(screen.queryByLabelText("arquivos do checkout")).not.toBeInTheDocument();
    // Com a coluna fora da tela, o `✕` dela também saiu. Se este botão tivesse
    // ido para lá, não haveria como voltar.
    expect(
      await screen.findByRole("button", { name: "abrir a coluna de arquivos" }),
    ).toBeInTheDocument();
  });

  it("muda a caixa do terminal sem desmontá-lo", async () => {
    // O refit em si é do `ResizeObserver`, e o `terminal-refit.test.tsx` prova
    // que ele observa a caixa do terminal. O que se prova aqui é a outra metade:
    // que o botão novo mexe nessa caixa com a sessão viva, em vez de trocar a
    // sessão por outra montagem.
    const user = userEvent.setup();
    trpc.session.listByScope.query.mockImplementation(async ({ scopeType }) =>
      scopeType === "worktree" ? [session()] : [],
    );

    await selectWorktree(user);
    await user.click(await screen.findByRole("tab", { name: /shell/ }));
    const terminal = await screen.findByTestId("terminal-mock");

    await user.click(screen.getByRole("button", { name: "abrir a coluna de arquivos" }));

    expect(await screen.findByLabelText("arquivos do checkout")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-mock")).toBe(terminal);
  });
});

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

  it("mostra o caminho em disco inteiro, e deixa copiar", async () => {
    // O que a mudança existe para consertar: no cabeçalho fixo este era o
    // primeiro valor a ser cortado, e é o único da tela que ninguém redigita
    // de cabeça.
    const user = userEvent.setup();
    const long = "/home/vinicius/.lumem/workspaces/pessoal/lorebase/worktrees/teste-de-nome-longo";
    trpc.worktree.getDetail.query.mockResolvedValue(detail({ path: long }));

    await selectWorktree(user);

    expect(await screen.findByText(long)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "copiar caminho" }));

    // A área de transferência aqui é a do `user-event`, que é uma de verdade:
    // o que se lê de volta é o que o botão escreveu.
    expect(await navigator.clipboard.readText()).toBe(long);
    expect(
      await screen.findByRole("button", { name: "caminho copiado" }),
    ).toBeInTheDocument();
  });

  it("mostra a distância da base e a idade, que no cabeçalho não cabiam", async () => {
    const user = userEvent.setup();
    trpc.worktree.getDetail.query.mockResolvedValue(
      detail({ aheadBehind: { ahead: 7, behind: 0 } }),
    );

    await selectWorktree(user);

    const panel = await screen.findByRole("tabpanel", { name: "teste" });
    expect(within(panel).getByText("↑7")).toBeInTheDocument();
    expect(within(panel).getByText(/em relação a main/)).toBeInTheDocument();
    expect(within(panel).getByText("criada")).toBeInTheDocument();
  });

  it("diz a natureza do escopo ao lado do nome", async () => {
    const user = userEvent.setup();
    await selectWorktree(user);

    const panel = await screen.findByRole("tabpanel", { name: "teste" });
    expect(within(panel).getByText("worktree")).toBeInTheDocument();
  });

  it("acende o ponto da aba quando a árvore está suja, e diz quantos", async () => {
    // O único sinal de sujeira que sobrevive a outra aba estar na frente.
    const user = userEvent.setup();
    trpc.worktree.getDetail.query.mockResolvedValue(
      detail({ status: { clean: false, changedFiles: 3 } }),
    );

    await selectWorktree(user);

    expect(
      await screen.findByRole("tab", { name: "teste árvore suja · 3 arquivos" }),
    ).toBeInTheDocument();
  });

  it("não põe ponto nenhum numa árvore limpa", async () => {
    // Ponto que está sempre lá deixa de ser sinal.
    const user = userEvent.setup();
    await selectWorktree(user);

    const tab = await screen.findByRole("tab", { name: "teste" });
    expect(tab.querySelector(".tab-item__dot")).toBeNull();
  });

  it("não chuta ponto quando o daemon não sabe o estado da árvore", async () => {
    const user = userEvent.setup();
    trpc.worktree.getDetail.query.mockResolvedValue(detail({ status: null }));

    await selectWorktree(user);

    const tab = await screen.findByRole("tab", { name: "teste" });
    expect(tab.querySelector(".tab-item__dot")).toBeNull();
  });

  it("escreve a branch no caminho só quando ela não é o nome do checkout", async () => {
    // Q1, leitura B′. No caminho comum nome e branch são a mesma string, e
    // imprimir as duas seria imprimir uma duas vezes. Quando divergem — worktree
    // importada, ou clonada de fora — o nome para de responder "qual branch".
    const user = userEvent.setup();
    await selectWorktree(user);
    const crumb = await screen.findByRole("navigation");
    expect(crumb).not.toHaveTextContent(/teste\s*teste/);

    cleanup();
    vi.mocked(trpc.worktree.listByProject.query).mockResolvedValue([
      { ...WORKTREE, name: "outra", branch: "feature/outra" },
    ]);
    trpc.worktree.getDetail.query.mockResolvedValue(
      detail({ name: "outra", branch: "feature/outra" }),
    );

    renderWithProviders(<App />);
    const tree = await screen.findByLabelText("árvore de projetos");
    await user.click(await within(tree).findByRole("button", { name: /^lorebase/ }));
    await user.click(await within(tree).findByRole("button", { name: /^outra/ }));

    expect(await screen.findByRole("navigation")).toHaveTextContent("feature/outra");
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
