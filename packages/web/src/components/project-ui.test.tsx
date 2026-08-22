import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));


function project(id: string, name: string, available = true) {
  return {
    id,
    workspaceId: "w1",
    name,
    path: `/repos/${name}`,
    defaultBranch: "main",
    available,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // `resetAllMocks` apaga implementação: sem isto, as queries que a tela do
  // workspace faz no `mount` voltam a devolver `undefined`, e o banner de erro
  // aparece como um `role="alert"` a mais num teste que não fala de erro.
  installTrpcDefaults();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.workspace.list.query.mockResolvedValue([
    { id: "w1", name: "pessoal", createdAt: new Date(), updatedAt: new Date() },
  ]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
  // react-query treats undefined as a programming error and says so on stderr.
  trpc.project.get.query.mockResolvedValue(null);
  // The sidebar renders a worktree tree per project; an unstubbed query there
  // fails and puts a second role="alert" on screen.
  trpc.worktree.listByProject.query.mockResolvedValue([]);
});

describe("project list", () => {
  it("lists the projects of the active workspace", async () => {
    trpc.project.listByWorkspace.query.mockResolvedValue([
      project("p1", "lorebase"),
      project("p2", "outro"),
    ]);

    renderWithProviders(<App />);

    const list = await screen.findByLabelText("árvore de projetos");
    expect(await within(list).findByRole("button", { name: /^lorebase/ })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /^outro/ })).toBeInTheDocument();
  });

  it("says so when the workspace has no projects", async () => {
    renderWithProviders(<App />);

    // An empty state, not a shrug: it says what a project is here and the
    // footer action sits right below it.
    expect(await screen.findByText("Nenhum projeto aqui")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adicionar projeto/ })).toBeInTheDocument();
  });

  it("marks a project whose repository is gone", async () => {
    // PRD §8: it stays listed. Vanishing would take the worktrees registered
    // under it out of sight as well.
    trpc.project.listByWorkspace.query.mockResolvedValue([project("p1", "lorebase", false)]);

    renderWithProviders(<App />);

    // The row says it in its own accessible name, so the state reaches someone
    // who cannot see that it is dimmed.
    expect(await screen.findByRole("button", { name: "lorebase sem disco" })).toBeInTheDocument();
  });
});

describe("add project", () => {
  it("adds a repository by absolute path", async () => {
    const user = userEvent.setup();
    trpc.project.add.mutate.mockImplementation(async () => {
      const added = project("p1", "lorebase");
      trpc.project.listByWorkspace.query.mockResolvedValue([added]);
      trpc.project.get.query.mockResolvedValue(added);
      return added;
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho do repositório"), "/repos/lorebase");
    await user.click(screen.getByRole("button", { name: "adicionar" }));

    await waitFor(() =>
      expect(trpc.project.add.mutate).toHaveBeenCalledWith({
        workspaceId: "w1",
        path: "/repos/lorebase",
      }),
    );
    // Adding then having to hunt for it in the list is a step for nothing. The
    // panel that opens is `local` — the checkout itself, which is where a
    // freshly added project actually is.
    expect(await screen.findByRole("heading", { name: "local" })).toBeInTheDocument();
  });

  it("sends an explicit name when one is typed", async () => {
    const user = userEvent.setup();
    trpc.project.add.mutate.mockResolvedValue(project("p1", "lore"));

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho do repositório"), "/repos/lorebase");
    await user.type(screen.getByLabelText("Nome (opcional)"), "lore");
    await user.click(screen.getByRole("button", { name: "adicionar" }));

    await waitFor(() =>
      expect(trpc.project.add.mutate).toHaveBeenCalledWith({
        workspaceId: "w1",
        path: "/repos/lorebase",
        name: "lore",
      }),
    );
  });

  it("shows exactly which validation the daemon refused", async () => {
    // F2.2. "caminho inválido" would send the user looking in the wrong place.
    const user = userEvent.setup();
    trpc.project.add.mutate.mockRejectedValue(
      new Error("/repos/x está dentro do repositório /repos, mas não é a raiz dele"),
    );

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho do repositório"), "/repos/x");
    await user.click(screen.getByRole("button", { name: "adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não é a raiz dele");
  });

  it("keeps the form open after a refusal so the path can be fixed", async () => {
    const user = userEvent.setup();
    trpc.project.add.mutate.mockRejectedValue(new Error("não é um repositório git"));

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: "adicionar projeto" }));
    await user.type(screen.getByLabelText("Caminho do repositório"), "/tmp");
    await user.click(screen.getByRole("button", { name: "adicionar" }));
    await screen.findByRole("alert");

    expect(screen.getByLabelText("Caminho do repositório")).toHaveValue("/tmp");
  });
});

describe("project detail", () => {
  it("shows the repository the daemon recorded", async () => {
    const user = userEvent.setup();
    const selected = project("p1", "lorebase");
    trpc.project.listByWorkspace.query.mockResolvedValue([selected]);
    trpc.project.get.query.mockResolvedValue(selected);

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /^lorebase/ }));

    // The project's own row points at `local`: everything the project detail
    // used to show lives there now.
    expect(await screen.findByRole("heading", { name: "local" })).toBeInTheDocument();
    expect(screen.getByText("/repos/lorebase")).toBeInTheDocument();
    expect(screen.getAllByText("main").length).toBeGreaterThan(0);
  });

  it("warns and blocks when the repository is missing from disk", async () => {
    const user = userEvent.setup();
    const missing = project("p1", "lorebase", false);
    trpc.project.listByWorkspace.query.mockResolvedValue([missing]);
    trpc.project.get.query.mockResolvedValue(missing);

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /^lorebase/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não está mais em /repos/lorebase");
    // Removing the registration stays allowed: it is how the user recovers.
    expect(screen.getByRole("button", { name: "remover projeto" })).toBeEnabled();
  });

  it("removes the registration and clears the detail", async () => {
    const user = userEvent.setup();
    const selected = project("p1", "lorebase");
    trpc.project.listByWorkspace.query.mockResolvedValue([selected]);
    trpc.project.get.query.mockResolvedValue(selected);
    trpc.project.remove.mutate.mockImplementation(async () => {
      trpc.project.listByWorkspace.query.mockResolvedValue([]);
      return { ok: true as const };
    });

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /^lorebase/ }));
    // F2.5 said out loud, where the decision is made.
    expect(await screen.findByText(/o diretório e o que está dentro dele ficam no disco/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "remover projeto" }));

    // O que sobra depois de remover o projeto é a **tela do workspace**, e não
    // mais a frase "selecione uma worktree": o painel central passou a responder
    // "onde eu estou" com uma tela (`workspace-screen`, W1).
    expect(await screen.findByText("Nenhum projeto ainda")).toBeInTheDocument();
  });

  it("shows the daemon's reason when removal is refused", async () => {
    const user = userEvent.setup();
    const selected = project("p1", "lorebase");
    trpc.project.listByWorkspace.query.mockResolvedValue([selected]);
    trpc.project.get.query.mockResolvedValue(selected);
    trpc.project.remove.mutate.mockRejectedValue(
      new Error("o projeto ainda tem worktrees registradas; remova-as antes"),
    );

    renderWithProviders(<App />);
    await user.click(await screen.findByRole("button", { name: /^lorebase/ }));
    await user.click(await screen.findByRole("button", { name: "remover projeto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ainda tem worktrees");
  });
});

describe("consumo por worktree, na visão do projeto (W4)", () => {
  it("mostra cada worktree e a linha que fecha a conta", async () => {
    /*
     * A linha `direto no projeto` existe porque sessão de escopo `project` não
     * pertence a worktree nenhuma: sem ela, a soma das worktrees não bate com o
     * total que a tela do workspace mostra para este projeto, e a diferença
     * apareceria como número faltando sem explicação.
     */
    trpc.usage.byWorktree.query.mockResolvedValue({
      worktrees: [
        {
          worktreeId: "wt1",
          name: "feat-checkout",
          tokens: 890_000,
          cost: 7.901,
          currency: "USD",
          turns: 52,
        },
      ],
      outside: { tokens: 150_000, cost: 1.3861, currency: "USD", turns: 10 },
    });

    const selected = project("p1", "lorebase");
    trpc.project.listByWorkspace.query.mockResolvedValue([selected]);
    trpc.project.get.query.mockResolvedValue(selected);

    renderWithProviders(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /^lorebase/ }));

    expect(await screen.findByText("feat-checkout")).toBeInTheDocument();
    expect(screen.getByText("890k")).toBeInTheDocument();
    expect(screen.getByText("direto no projeto")).toBeInTheDocument();
    expect(screen.getByText("US$ 1,3861")).toBeInTheDocument();
  });

  it("a janela do projeto é uma pergunta própria, não a do workspace", async () => {
    const selected = project("p1", "lorebase");
    trpc.project.listByWorkspace.query.mockResolvedValue([selected]);
    trpc.project.get.query.mockResolvedValue(selected);

    renderWithProviders(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /^lorebase/ }));
    await screen.findByText("nada gasto ainda neste projeto");

    const group = screen.getByRole("group", { name: "Janela de tempo do consumo do projeto" });
    await userEvent.click(within(group).getByRole("button", { name: "6m" }));

    expect(trpc.usage.byWorktree.query).toHaveBeenLastCalledWith({
      projectId: "p1",
      period: "6m",
    });
  });
});
