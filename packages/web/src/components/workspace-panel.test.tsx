import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../test/trpc-mock.js";

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

/** Uma configuração de agente ACP, que é o que decide se a divisão existe. */
const agent = (id: string, name: string) => ({
  id,
  name,
  command: `/adapters/${name}/bin/${name}`,
  args: [],
  env: {},
  transport: "acp",
  adapterVersion: "1.0.0",
  available: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** Uma linha da consulta agrupada por agente. */
const byAgent = (overrides: Record<string, unknown> = {}) => ({
  projectId: "p1",
  agentConfigId: "a1",
  name: "claude",
  tokens: 994_000,
  cost: 12.4071,
  currency: "USD",
  turns: 61,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // A tela ganhou a seção de tarefas (`022` T8), e ela consulta no `mount`. Sem
  // os defaults, a query devolve `undefined`, o `useQuery` estoura, e o banner
  // de erro dela vira um segundo `role="alert"` na tela — que é exatamente o
  // sintoma que o cabeçalho do `trpc-mock` descreve.
  installTrpcDefaults();
  trpc.project.listByWorkspace.query.mockResolvedValue([project()]);
  // Um agente por default: é o estado normal, e nele a divisão não existe.
  trpc.agentConfig.list.query.mockResolvedValue([agent("a1", "claude")]);
  trpc.usage.byProjectAndAgent.query.mockResolvedValue([]);
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
    // Sem clique nenhum: a fila mora no **topo** da tela desde a `022` T4.
    // Um lugar para "o que o sistema quer que eu decida" vale mais que dois.

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
    // Sem clique nenhum: a fila mora no **topo** da tela desde a `022` T4.
    // Um lugar para "o que o sistema quer que eu decida" vale mais que dois.
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

describe("a divisão por agente", () => {
  it("com um agente, não existe: sem `▸` e sem a consulta", async () => {
    /*
     * A C5 escrita em teste: a comparação só aparece quando há o que comparar.
     * Não é só um pixel a menos — é uma consulta que **não acontece**.
     */
    render();
    await screen.findByText("1,4M");

    expect(screen.queryByRole("button", { name: /divisão por agente/ })).not.toBeInTheDocument();
    expect(trpc.usage.byProjectAndAgent.query).not.toHaveBeenCalled();
  });

  it("com dois, a linha abre e mostra o que cada um gastou", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([agent("a1", "claude"), agent("a2", "codex")]);
    trpc.usage.byProjectAndAgent.query.mockResolvedValue([
      byAgent(),
      byAgent({ agentConfigId: "a2", name: "codex", tokens: 406_000, cost: null, currency: null, turns: 25 }),
    ]);

    render();
    const twist = await screen.findByRole("button", { name: /abrir a divisão por agente/ });
    await userEvent.click(twist);

    expect(await screen.findByText("claude")).toBeInTheDocument();
    expect(screen.getByText("codex")).toBeInTheDocument();
    expect(screen.getByText("994k")).toBeInTheDocument();
    expect(screen.getByText("406k")).toBeInTheDocument();
    // O agente que não informa dinheiro continua sem parecer grátis, um nível
    // abaixo como um nível acima.
    expect(screen.getByText("sem custo reportado")).toBeInTheDocument();
  });

  it("nasce fechada: a divisão é uma pergunta, não um relatório", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([agent("a1", "claude"), agent("a2", "codex")]);
    trpc.usage.byProjectAndAgent.query.mockResolvedValue([byAgent()]);

    render();
    await screen.findByRole("button", { name: /abrir a divisão por agente/ });

    // A linha do projeto está lá; a do agente, não — até alguém pedir.
    expect(screen.getByText("lorebase")).toBeInTheDocument();
    expect(screen.queryByText("claude")).not.toBeInTheDocument();
  });

  it("o turno sem agente aparece pelo que ele é, e não somado a alguém", async () => {
    // A linha gravada antes da coluna existir. Escolher um culpado seria pior que
    // dizer "não sei".
    trpc.agentConfig.list.query.mockResolvedValue([agent("a1", "claude"), agent("a2", "codex")]);
    trpc.usage.byProjectAndAgent.query.mockResolvedValue([
      byAgent(),
      byAgent({ agentConfigId: null, name: null, tokens: 50_000, cost: null, currency: null, turns: 2 }),
    ]);

    render();
    await userEvent.click(await screen.findByRole("button", { name: /abrir a divisão/ }));

    expect(await screen.findByText("antes desta versão")).toBeInTheDocument();
    expect(screen.getByText("50,0k")).toBeInTheDocument();
  });

  it("a janela vale para as duas consultas, e não para uma só", async () => {
    // Duas respostas com janelas diferentes na mesma tela seriam a soma de baixo
    // não fechando com a de cima, sem nada na tela explicando por quê.
    trpc.agentConfig.list.query.mockResolvedValue([agent("a1", "claude"), agent("a2", "codex")]);
    trpc.usage.byProjectAndAgent.query.mockResolvedValue([byAgent()]);

    render();
    await screen.findByText("1,4M");
    await userEvent.click(screen.getByRole("button", { name: "1m" }));

    expect(trpc.usage.byProjectAndAgent.query).toHaveBeenLastCalledWith({
      workspaceId: "ws1",
      period: "1m",
    });
  });

  it("o projeto sem divisão não perde nenhuma coluna", async () => {
    /*
     * A grade é da lista, e ela é a mesma para todas as linhas. Um projeto que só
     * um agente usou fica sem sub-linha e **com** a célula do `▸` vazia — sem
     * isso os números dele andariam para a esquerda e deixariam de bater com os
     * de cima, que é a única razão de a lista ter colunas.
     */
    trpc.agentConfig.list.query.mockResolvedValue([agent("a1", "claude"), agent("a2", "codex")]);
    trpc.project.listByWorkspace.query.mockResolvedValue([project(), project({ id: "p2", name: "web" })]);
    trpc.usage.byProject.query.mockResolvedValue([spend(), spend({ projectId: "p2", name: "web" })]);
    trpc.usage.byProjectAndAgent.query.mockResolvedValue([byAgent()]);

    render();
    // Espera o `▸`, e não o nome: a segunda consulta responde depois da primeira,
    // e esperar pelo nome do projeto olha a tela antes de ela ter a divisão.
    await screen.findByRole("button", { name: /divisão por agente/ });

    // Um `▸` só: o outro projeto não tem divisão para abrir.
    expect(screen.getAllByRole("button", { name: /divisão por agente/ })).toHaveLength(1);
    // E as duas linhas continuam com o mesmo número de células.
    // Restrito à lista de consumo: o nome do projeto também aparece no filtro
    // de projeto das tarefas desde a `022`, e ali ele é uma `<option>`.
    const cells = screen
      .getAllByText(/^(lorebase|web)$/)
      .filter((name) => name.classList.contains("spend__name"))
      .map((name) => name.parentElement?.childElementCount);
    expect(new Set(cells).size).toBe(1);
  });
});
