import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

import { WorkspacePanel } from "./WorkspacePanel.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * A tela do workspace (`workspace-screen`).
 *
 * As asserções são sobre as decisões que uma tela pode errar: se a memória chega
 * sem projeto (o buraco que originou a feature), se quem não gastou continua na
 * lista, se custo ausente é dito em vez de virar zero, e se remover diz por que
 * não pode.
 */

const project = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  workspaceId: "ws1",
  name: "lorebase",
  path: "/repos/lorebase",
  defaultBranch: "main",
  available: true,
  createdAt: new Date("2026-08-01T12:00:00Z"),
  updatedAt: new Date("2026-08-01T12:00:00Z"),
  ...overrides,
});

const spend = (overrides: Record<string, unknown> = {}) => ({
  projectId: "p1",
  name: "lorebase",
  tokens: 1_400_000,
  cost: 12.4071,
  currency: "USD",
  turns: 86,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  trpc.project.listByWorkspace.query.mockResolvedValue([project()]);
  trpc.usage.byProject.query.mockResolvedValue([spend()]);
  // A memória do painel: vazia por default, para cada teste dizer o que importa.
  trpc.memory.list.query.mockResolvedValue({ entries: [], shadowed: [] });
  trpc.memory.proposals.query.mockResolvedValue([]);
  trpc.memory.decisions.query.mockResolvedValue([]);
  trpc.memory.usage.query.mockResolvedValue([]);
  trpc.memory.core.query.mockResolvedValue({ chars: 0, recentChars: 0, entries: [] });
  trpc.memory.settings.query.mockResolvedValue({
    distill: false,
    autoLearn: false,
    autoLearnBudget: 3,
  });
  trpc.memory.playbooks.query.mockResolvedValue([]);
});

function render() {
  renderWithProviders(
    <WorkspacePanel workspaceId="ws1" workspaceName="pessoal" onRemoved={() => {}} />,
  );
}

describe("WorkspacePanel", () => {
  it("a memória do workspace chega sem nenhum projeto aberto", async () => {
    // O buraco que originou a feature: sem checkout selecionado não havia painel
    // direito, então memória de workspace e global eram inalcançáveis.
    trpc.project.listByWorkspace.query.mockResolvedValue([]);
    trpc.usage.byProject.query.mockResolvedValue([]);
    trpc.memory.list.query.mockResolvedValue({
      entries: [
        {
          id: "e1",
          path: "workspaces/ws1/memory/process_commit.md",
          type: "process",
          scope: "workspace",
          slug: "commit",
          workspaceId: "ws1",
          projectId: null,
          name: "Commit neste workspace",
          description: "Conventional Commits",
          sourceActor: "human",
          confidence: "high",
          pinned: false,
          contentHash: "h",
          createdAt: new Date("2026-08-01T12:00:00Z"),
          updatedAt: new Date("2026-08-01T12:00:00Z"),
        },
      ],
      shadowed: [],
    });

    render();

    expect(await screen.findByText("Commit neste workspace")).toBeInTheDocument();
    // E o escopo é o do workspace: sem `projectId`.
    expect(trpc.memory.list.query).toHaveBeenCalledWith({ workspaceId: "ws1" });
  });

  it("o consumo aparece por projeto, com tokens e dinheiro", async () => {
    render();

    expect(await screen.findByText("1,4M")).toBeInTheDocument();
    expect(screen.getByText("US$ 12,4071")).toBeInTheDocument();
    expect(screen.getByText("86 turnos")).toBeInTheDocument();
  });

  it("quem não gastou continua na lista, com zero", async () => {
    // "Não gastou" é resposta; uma lista que esconde obriga a pessoa a lembrar o
    // que deveria estar ali.
    trpc.usage.byProject.query.mockResolvedValue([
      spend(),
      spend({ projectId: "p2", name: "web", tokens: 0, cost: null, currency: null, turns: 0 }),
    ]);

    render();

    expect(await screen.findByText("web")).toBeInTheDocument();
    expect(screen.getByText("nenhum turno")).toBeInTheDocument();
  });

  it("custo que ninguém reportou é dito, não vira zero", async () => {
    // Um agente que não informa dinheiro não pode parecer grátis.
    trpc.usage.byProject.query.mockResolvedValue([spend({ cost: null, currency: null })]);

    render();

    expect(await screen.findByText("sem custo reportado")).toBeInTheDocument();
    expect(screen.queryByText("US$ 0,0000")).not.toBeInTheDocument();
  });

  it("a janela de tempo é uma pergunta nova ao daemon", async () => {
    render();
    await screen.findByText("1,4M");

    await userEvent.click(screen.getByRole("button", { name: "1m" }));

    // O corte é resolvido no daemon: o cliente manda o nome da janela.
    expect(trpc.usage.byProject.query).toHaveBeenLastCalledWith({
      workspaceId: "ws1",
      period: "1m",
    });
  });

  it("remover fica desabilitado com projeto dentro, e diz por quê", async () => {
    render();

    // Esperar a lista responder: enquanto ela carrega, "quantos projetos tem
    // dentro" não tem resposta, e o botão fica desabilitado por isso — o assert
    // teria passado pelo motivo errado.
    expect(await screen.findByText("1 projeto dentro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "remover workspace" })).toBeDisabled();
  });

  it("workspace vazio pode ser removido", async () => {
    trpc.project.listByWorkspace.query.mockResolvedValue([]);
    trpc.usage.byProject.query.mockResolvedValue([]);
    trpc.workspace.remove.mutate.mockResolvedValue(undefined);

    render();

    // Só depois de a lista dizer que está vazia o botão passa a valer.
    await screen.findByText("Nenhum projeto ainda");
    const remove = screen.getByRole("button", { name: "remover workspace" });
    expect(remove).toBeEnabled();
    await userEvent.click(remove);

    expect(trpc.workspace.remove.mutate).toHaveBeenCalledWith({ id: "ws1" });
  });

  it("renomear é em linha, sem modal", async () => {
    trpc.workspace.rename.mutate.mockResolvedValue({ id: "ws1", name: "trabalho" });

    render();

    await userEvent.click(await screen.findByRole("button", { name: "renomear" }));
    const field = screen.getByLabelText("Nome do workspace");
    await userEvent.clear(field);
    await userEvent.type(field, "trabalho");
    await userEvent.click(screen.getByRole("button", { name: "salvar" }));

    expect(trpc.workspace.rename.mutate).toHaveBeenCalledWith({ id: "ws1", name: "trabalho" });
  });

  it("workspace sem projeto explica o que ele é", async () => {
    trpc.project.listByWorkspace.query.mockResolvedValue([]);
    trpc.usage.byProject.query.mockResolvedValue([]);

    render();

    expect(await screen.findByText("Nenhum projeto ainda")).toBeInTheDocument();
    expect(screen.getByText(/conjunto de projetos que se conhecem/)).toBeInTheDocument();
  });
});
