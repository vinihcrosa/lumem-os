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

describe("remover — o caminho da recusa (W2, T6)", () => {
  it("a recusa do daemon aparece como recusa, e a tela continua de pé", async () => {
    /*
     * O botão desabilitado cobre o caminho **previsto**: enquanto a lista diz que
     * há projeto dentro, não há clique. O que este teste cobre é a corrida — o
     * projeto entrar entre a leitura da lista e o clique —, e nela quem recusa é o
     * banco, por `ON DELETE RESTRICT`. A recusa tem que chegar na tela com o motivo:
     * "não deu" não deixa nada para agir.
     */
    trpc.project.listByWorkspace.query.mockResolvedValue([]);
    trpc.usage.byProject.query.mockResolvedValue([]);
    trpc.workspace.remove.mutate.mockRejectedValue(
      new Error("o workspace ainda tem projetos dentro"),
    );

    render();

    await screen.findByText("Nenhum projeto ainda");
    await userEvent.click(screen.getByRole("button", { name: "remover workspace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ainda tem projetos dentro");
    // A tela continua utilizável: o botão volta a valer, e nada foi desmontado.
    expect(screen.getByRole("button", { name: "remover workspace" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "pessoal" })).toBeInTheDocument();
  });
});

describe("a inbox de propostas, sem projeto aberto (T3)", () => {
  /*
   * O que esta prova acrescenta: que a inbox **funciona daqui**.
   *
   * A `MemoryPanel` é o mesmo componente da aba do projeto, então "provavelmente
   * funciona" era verdade — e é exatamente o tipo de afirmação que uma caixa de
   * `Done when` não pode carregar. O que muda no painel do workspace é o escopo
   * (`projectId: null`), e o que precisa ser dito é que revisar não depende de
   * haver checkout selecionado.
   */
  const proposal = {
    id: "prop1",
    path: "workspaces/ws1/memory/domain_plano-sem-preco.md",
    type: "domain",
    scope: "workspace",
    slug: "plano-sem-preco",
    workspaceId: "ws1",
    projectId: null,
    name: "Plano sem preço",
    description: "Usuário sem plano vê catálogo, não preço",
    body: "regra",
    actor: "agent",
    fromProjectId: "api",
    sessionId: null,
    confidence: "medium",
    evidence: "api/src/billing/plan.ts:88",
    status: "pending",
    resolvedAt: null,
    resolutionNote: null,
    current: null,
    createdAt: new Date("2026-08-20T12:00:00Z"),
    updatedAt: new Date("2026-08-20T12:00:00Z"),
  };

  it("a proposta é revisada e aprovada sem nenhum projeto aberto", async () => {
    trpc.project.listByWorkspace.query.mockResolvedValue([]);
    trpc.usage.byProject.query.mockResolvedValue([]);
    trpc.memory.proposals.query.mockResolvedValue([proposal]);
    trpc.memory.approveProposal.mutate.mockResolvedValue({ path: proposal.path });

    render();

    // Workspace vazio: é o caso em que, antes desta feature, não havia porta.
    await screen.findByText("Nenhum projeto ainda");
    await userEvent.click(await screen.findByRole("tab", { name: /Propostas/ }));

    expect(await screen.findByText("Plano sem preço")).toBeInTheDocument();
    // A evidência aparece: é o que separa fato de conclusão na revisão.
    expect(screen.getByText("api/src/billing/plan.ts:88")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Aprovar" }));

    expect(trpc.memory.approveProposal.mutate).toHaveBeenCalledWith({ id: "prop1" });
  });

  it("rejeitar também, e a recusa é histórico e não apagamento", async () => {
    trpc.project.listByWorkspace.query.mockResolvedValue([]);
    trpc.usage.byProject.query.mockResolvedValue([]);
    trpc.memory.proposals.query.mockResolvedValue([proposal]);
    trpc.memory.rejectProposal.mutate.mockResolvedValue({ ...proposal, status: "rejected" });

    render();
    await userEvent.click(await screen.findByRole("tab", { name: /Propostas/ }));
    await screen.findByText("Plano sem preço");

    // O primeiro `Rejeitar` abre o campo da nota; o segundo confirma. Duas
    // etapas de propósito: recusar sem dizer por que perde o histórico que a
    // inbox existe para guardar.
    await userEvent.click(screen.getByRole("button", { name: "Rejeitar" }));
    await userEvent.type(
      screen.getByLabelText(/por que/i),
      "isso é regra do api, não do produto",
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Rejeitar" })[0]!);

    expect(trpc.memory.rejectProposal.mutate).toHaveBeenCalledWith({
      id: "prop1",
      note: "isso é regra do api, não do produto",
    });
  });
});
