import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * O endereço, e o que jsdom consegue provar dele (`030-settings`, fase 1).
 *
 * **jsdom tem `history`**, então `pushState`, `replaceState` e `popstate` são
 * reais aqui — o que ele não tem é barra de endereço e `F5`. Um teste de
 * componente passa contra um roteador que nunca sobreviveu a um reload, e é por
 * isso que a T15 é um e2e e não mais um caso neste arquivo.
 */

function project(id: string, name: string) {
  return {
    id,
    workspaceId: "w1",
    name,
    path: `/repos/${name}`,
    defaultBranch: "main",
    available: true,
    hasCommits: true,
    remoteUrl: null,
    managed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function worktree(id: string, name: string) {
  return {
    id,
    projectId: "p1",
    name,
    branch: name,
    path: `/repos/lumem-wt/${name}`,
    state: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.workspace.list.query.mockResolvedValue([
    { id: "w1", name: "pessoal", createdAt: new Date(), updatedAt: new Date() },
  ]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
  trpc.project.get.query.mockResolvedValue(null);
  trpc.worktree.listByProject.query.mockResolvedValue([]);
  trpc.project.parseSource.query.mockResolvedValue({ kind: "path", path: "/repos/lumem" });
  trpc.project.cloneJobs.query.mockResolvedValue([]);
});

describe("a entrada de /settings", () => {
  it("é uma linha do bloco de navegação, e ela é uma só", async () => {
    renderWithProviders(<App />);

    const entradas = await screen.findAllByRole("button", { name: /^Configurações/ });

    expect(entradas).toHaveLength(1);
  });

  /*
   * O bloco descrevia *Telas do workspace* quando as duas que existiam eram do
   * workspace. `Configurações` mistura workspace, máquina, repositório e
   * navegador — descrição que envelheceu se reescreve.
   */
  it("o bloco deixou de se chamar `Telas do workspace`", async () => {
    renderWithProviders(<App />);

    expect(await screen.findByRole("navigation", { name: "Telas" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Telas do workspace" })).toBeNull();
  });

  it("clicar nela muda o caminho e abre a tela", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(await screen.findByRole("button", { name: /^Configurações/ }));

    expect(window.location.pathname).toBe("/settings");
    expect(await screen.findByRole("heading", { name: "Configurações", level: 1 })).toBeInTheDocument();
  });

  it("voltar para Home muda o caminho de volta", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(await screen.findByRole("button", { name: /^Configurações/ }));
    await user.click(screen.getByRole("button", { name: /^Home/ }));

    expect(window.location.pathname).toBe("/");
  });
});

describe("a tela lida do caminho", () => {
  /*
   * O caso que `useState` mais `useEffect` não passa: o valor do **primeiro**
   * render tem que ser o caminho de verdade, ou `/settings` desenha o Home por
   * um quadro antes de trocar.
   */
  it("abrir /settings direto já desenha a tela de configurações", async () => {
    window.history.replaceState(null, "", "/settings");

    renderWithProviders(<App />);

    expect(
      await screen.findByRole("heading", { name: "Configurações", level: 1 }),
    ).toBeInTheDocument();
  });

  it("abrir /tasks direto já desenha o quadro", async () => {
    window.history.replaceState(null, "", "/tasks");
    trpc.task.board.query.mockResolvedValue([]);

    renderWithProviders(<App />);

    // Duas ocorrências: o título da tela e o último segmento do caminho — as
    // duas nasceram na `029`, F1.4.
    expect(await screen.findAllByText("Quadro de tarefas")).not.toHaveLength(0);
  });

  /*
   * O `popstate` é o que o botão voltar faz, e é a metade que um `pushState`
   * sozinho não cobre.
   */
  it("o botão voltar sai de /settings", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(await screen.findByRole("button", { name: /^Configurações/ }));
    expect(window.location.pathname).toBe("/settings");

    window.history.back();

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    // E a tela trocou junto: o que `popstate` move é o caminho, e a tela é
    // derivada dele — se não fosse, o endereço mudaria com a tela parada.
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Configurações", level: 1 })).toBeNull(),
    );
  });
});

describe("o checkout é seleção, e não lugar", () => {
  beforeEach(() => {
    trpc.project.listByWorkspace.query.mockResolvedValue([project("p1", "lumem")]);
    trpc.worktree.listByProject.query.mockResolvedValue([worktree("wt1", "teste")]);
    trpc.project.get.query.mockResolvedValue(project("p1", "lumem"));
  });

  /*
   * Com `push`, o botão voltar viraria *desfazer seleção*, e uma sessão normal
   * de trabalho encheria o histórico de entradas que ninguém pediu.
   */
  it("selecionar uma worktree não empilha entrada no histórico", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(await screen.findByRole("button", { name: /^Configurações/ }));
    const depoisDeNavegar = window.history.length;

    await user.click(await screen.findByRole("button", { name: /teste/ }));

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(window.history.length).toBe(depoisDeNavegar);
  });

  /*
   * A barra de endereço não pode dizer `/settings` com um checkout na frente: a
   * seleção manda na coluna do meio, então a rota vai junto com ela.
   */
  it("selecionar a partir de /settings leva o caminho para a raiz", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/settings");
    renderWithProviders(<App />);

    await user.click(await screen.findByRole("button", { name: /teste/ }));

    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });
});
