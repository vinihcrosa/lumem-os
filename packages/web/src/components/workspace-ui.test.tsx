import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));


function workspace(id: string, name: string) {
  return { id, name, createdAt: new Date(), updatedAt: new Date() };
}

beforeEach(() => {
  vi.resetAllMocks();
  // `resetAllMocks` apaga implementação, e as telas que consultam o daemon no
  // `mount` voltariam a devolver `undefined` — o que o `useQuery` recusa.
  installTrpcDefaults();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.workspace.list.query.mockResolvedValue([]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
});

describe("first access", () => {
  it("hands an empty machine the flow, not the app", async () => {
    // PRD §5 still holds — everything below is scoped to a workspace, so an empty
    // sidebar would present a broken app. What changed is what fills the screen
    // instead: the whole first-access flow, not a single field.
    renderWithProviders(<App />);

    expect(
      await screen.findByRole("heading", { name: /O daemon já está rodando/ }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("árvore de projetos")).not.toBeInTheDocument();
  });

  it("does not show the flow to a machine that already has a workspace", async () => {
    trpc.workspace.list.query.mockResolvedValue([workspace("w1", "pessoal")]);

    renderWithProviders(<App />);

    expect(await screen.findByLabelText("Workspace")).toHaveValue("w1");
    expect(screen.queryByRole("heading", { name: /O daemon já está rodando/ })).not.toBeInTheDocument();
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

describe("remover o workspace pela tela (T6)", () => {
  it("depois de remover, o seletor aponta para o que sobrou", async () => {
    /*
     * O risco não é o daemon, é a tela: remover o workspace ativo deixaria o
     * seletor apontando para um `id` que não existe mais, e o único jeito de sair
     * seria limpar o `localStorage` à mão.
     */
    const user = userEvent.setup();
    trpc.workspace.list.query.mockResolvedValue([
      workspace("w1", "pessoal"),
      workspace("w2", "trabalho"),
    ]);
    trpc.workspace.remove.mutate.mockImplementation(async () => {
      trpc.workspace.list.query.mockResolvedValue([workspace("w2", "trabalho")]);
      return undefined;
    });

    renderWithProviders(<App />);
    /*
     * Escolher `w1` **explicitamente**, e não confiar no default.
     *
     * Sem esta linha o teste passava por acidente: com nada no `localStorage`, o
     * ativo é o primeiro da lista, então depois da remoção ele já seria `w2` sem
     * ninguém validar nada. Verificado por mutação — tirar a validação contra a
     * lista não derrubava o teste. Selecionado, `w1` fica **lembrado**, e o que
     * salva a tela é a validação.
     */
    await user.selectOptions(await screen.findByLabelText("Workspace"), "w1");
    await screen.findByText("Nenhum projeto ainda");

    await user.click(screen.getByRole("button", { name: "remover workspace" }));

    await waitFor(() => expect(screen.getByLabelText("Workspace")).toHaveValue("w2"));
    expect(screen.getByRole("heading", { name: "trabalho" })).toBeInTheDocument();
  });

  it("remover o último workspace devolve o primeiro acesso, e não uma tela vazia", async () => {
    // Sem workspace não há app: tudo abaixo dele é escopado a um. O fluxo do
    // primeiro acesso é a resposta certa, e ele já sabia disso — o que faltava era
    // alguém chegar nesse estado pela tela.
    const user = userEvent.setup();
    trpc.workspace.list.query.mockResolvedValue([workspace("w1", "pessoal")]);
    trpc.workspace.remove.mutate.mockImplementation(async () => {
      trpc.workspace.list.query.mockResolvedValue([]);
      return undefined;
    });
    trpc.setup.preflight.query.mockResolvedValue({
      git: { ok: true, version: "2.45.0" },
      node: { ok: true, version: "22.0.0" },
      home: { ok: true, path: "/home/eu/.lumem" },
    });

    renderWithProviders(<App />);
    await screen.findByText("Nenhum projeto ainda");

    await user.click(screen.getByRole("button", { name: "remover workspace" }));

    expect(await screen.findByRole("button", { name: /Configurar em 5 passos/ })).toBeInTheDocument();
  });
});
