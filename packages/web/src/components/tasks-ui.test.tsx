import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTrpcDefaults, trpcMock } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", () => ({ trpc: trpcMock }));

const { TaskList } = await import("./TaskList.js");
const { TaskDetail, suggestName } = await import("./TaskDetail.js");
const { ProposalQueue } = await import("./ProposalQueue.js");
const trpc = trpcMock;

/**
 * A lista e o detalhe de tarefas (`022-workspace-tasks` T8 e T9).
 *
 * **A ordem é asserida com os quatro estados misturados**, e é o caso que mais
 * importa aqui: ela é uma decisão de produto — `review` e `in_progress` primeiro,
 * porque são o que está acontecendo e o que espera você —, e uma decisão de
 * produto sem teste volta a ser opinião na primeira refatoração.
 *
 * A ordem vem do daemon; o que a tela garante é que **não a reordena**.
 */

function renderUI(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function task(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t1",
    workspaceId: "w1",
    projectId: "p1",
    title: "uma tarefa",
    body: "",
    status: "open",
    createdBy: "human",
    createdBySession: null,
    worktreeId: null,
    links: "[]",
    reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  installTrpcDefaults();
  trpc.project.listByWorkspace.query.mockResolvedValue([
    { id: "p1", name: "acme-api" },
    { id: "p2", name: "acme-web" },
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("a lista de tarefas", () => {
  it("não reordena o que o daemon mandou", async () => {
    trpc.task.listByWorkspace.query.mockResolvedValue([
      task({ id: "a", title: "em revisão", status: "review" }),
      task({ id: "b", title: "andando", status: "in_progress" }),
      task({ id: "c", title: "aberta", status: "open" }),
    ]);

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    const rows = await screen.findAllByRole("button", { name: /revisão|andando|aberta/ });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("em revisão"),
      expect.stringContaining("andando"),
      expect.stringContaining("aberta"),
    ]);
  });

  it("recolhe done e esconde dropped", async () => {
    // `done` é histórico e `dropped` é arquivo: nenhum dos dois é "o que está
    // acontecendo", que é o que a lista responde.
    const user = userEvent.setup();
    trpc.task.listByWorkspace.query.mockResolvedValue([
      task({ id: "a", title: "aberta" }),
      task({ id: "b", title: "fechada", status: "done" }),
      task({ id: "c", title: "arquivada", status: "dropped", reason: "sem alvo" }),
    ]);

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    expect(await screen.findByText("aberta")).toBeInTheDocument();
    expect(screen.queryByText("fechada")).not.toBeInTheDocument();
    expect(screen.queryByText("arquivada")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /done/ }));
    expect(await screen.findByText("fechada")).toBeInTheDocument();
    // `dropped` continua fora: ele só volta pelo filtro de status.
    expect(screen.queryByText("arquivada")).not.toBeInTheDocument();
  });

  it("marca só o que não é o default — tarefa sua não ganha glifo", async () => {
    trpc.task.listByWorkspace.query.mockResolvedValue([
      task({ id: "a", title: "minha" }),
      task({ id: "b", title: "dele", createdBy: "agent", createdBySession: "se-1" }),
    ]);

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    const mine = (await screen.findByText("minha")).closest("button")!;
    const theirs = screen.getByText("dele").closest("button")!;
    expect(within(mine).queryByText("proposta")).not.toBeInTheDocument();
    expect(within(theirs).getByText("proposta")).toBeInTheDocument();
  });

  it("ensina em vez de parecer quebrada quando nunca houve tarefa", async () => {
    trpc.task.listByWorkspace.query.mockResolvedValue([]);

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} onCreate={() => {}} />);

    expect(await screen.findByText("Nenhuma tarefa ainda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "criar a primeira" })).toBeInTheDocument();
  });

  /** O workspace de quem nunca pediu teto — o default, e o caso comum. */
  const SEM_TETO = { costPerTask: null, costPerDay: null, turnsPerSession: null };

  it("diz o teto de criação e onde mudar — teto invisível parece bug", async () => {
    trpc.task.listByWorkspace.query.mockResolvedValue([task()]);
    trpc.task.settings.query.mockResolvedValue({
      budget: 5,
      budgetEnv: "LUMEM_TASKS_BUDGET",
      sessions: 0,
      sessionsWithTask: 0,
      caps: SEM_TETO,
    });

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    expect(await screen.findByText(/5/)).toBeInTheDocument();
    expect(screen.getByText("LUMEM_TASKS_BUDGET")).toBeInTheDocument();
  });

  it("`sem teto` é palavra, e não campo vazio", async () => {
    // Um vazio numa linha sobre limite parece defeito, e a ausência de teto é
    // uma resposta (`028` Parte 3, T18).
    trpc.task.listByWorkspace.query.mockResolvedValue([task()]);
    trpc.task.settings.query.mockResolvedValue({
      budget: 5,
      budgetEnv: "LUMEM_TASKS_BUDGET",
      sessions: 0,
      sessionsWithTask: 0,
      caps: SEM_TETO,
    });

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    expect(await screen.findAllByText(/sem teto/)).toHaveLength(3);
  });

  it("`0` aparece como `0`, porque bloquear tudo não é não ter teto", async () => {
    trpc.task.listByWorkspace.query.mockResolvedValue([task()]);
    trpc.task.settings.query.mockResolvedValue({
      budget: 5,
      budgetEnv: "LUMEM_TASKS_BUDGET",
      sessions: 0,
      sessionsWithTask: 0,
      caps: { costPerTask: 2, costPerDay: null, turnsPerSession: 0 },
    });

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    expect(await screen.findByText("US$ 2.00")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getAllByText(/sem teto/)).toHaveLength(1);
  });

  it("mostra a medida de cerimônia, e ela existe para incomodar", async () => {
    /*
     * §7 do PRD: `sessões com tarefa ÷ sessões`, e ele **espera que não seja
     * 100%**. Se for, todo mundo está criando tarefa para agradar o daemon — e
     * o lugar da tarefa está errado. Ninguém procura uma métrica que não
     * incomoda, então ela fica na tela.
     */
    trpc.task.listByWorkspace.query.mockResolvedValue([task()]);
    trpc.task.settings.query.mockResolvedValue({
      budget: 5,
      budgetEnv: "LUMEM_TASKS_BUDGET",
      sessions: 12,
      sessionsWithTask: 4,
      caps: SEM_TETO,
    });

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    expect(await screen.findByText("4 de 12")).toBeInTheDocument();
    // Escopado ao workspace: o número descreve o lugar onde ele aparece.
    expect(trpc.task.settings.query).toHaveBeenCalledWith({ workspaceId: "w1" });
  });

  it("some a proporção quando não houve sessão nenhuma", async () => {
    // Zero de zero não é uma proporção, é uma divisão por zero com cara de dado.
    trpc.task.listByWorkspace.query.mockResolvedValue([task()]);

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    expect(await screen.findByText("LUMEM_TASKS_BUDGET")).toBeInTheDocument();
    expect(screen.queryByText(/sessões têm tarefa/)).not.toBeInTheDocument();
  });

  it("abre o detalhe da tarefa clicada", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    trpc.task.listByWorkspace.query.mockResolvedValue([task({ id: "t9", title: "clicável" })]);

    renderUI(<TaskList workspaceId="w1" onOpen={onOpen} />);
    await user.click(await screen.findByText("clicável"));

    expect(onOpen).toHaveBeenCalledWith("t9");
  });
});

describe("o detalhe da tarefa", () => {
  it("oferece done porque quem está olhando é humano", async () => {
    // T9: nenhum caminho desta tela oferece `done` a um agente — o que ele
    // alcança é `review`, pela porta HTTP.
    trpc.task.get.query.mockResolvedValue(task({ title: "consertar o /orders" }));

    renderUI(<TaskDetail taskId="t1" workspaceId="w1" onBack={() => {}} onWork={() => {}} />);

    expect(await screen.findByRole("button", { name: "marcar done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "trabalhar nesta tarefa" })).toBeInTheDocument();
  });

  it("troca os verbos quando a tarefa saiu do fluxo", async () => {
    trpc.task.get.query.mockResolvedValue(task({ status: "done" }));

    renderUI(<TaskDetail taskId="t1" workspaceId="w1" onBack={() => {}} onWork={() => {}} />);

    expect(await screen.findByRole("button", { name: "reabrir" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "marcar done" })).not.toBeInTheDocument();
  });

  it("não inventa checkout quando não há", async () => {
    trpc.task.get.query.mockResolvedValue(task({ worktreeId: null }));

    renderUI(<TaskDetail taskId="t1" workspaceId="w1" onBack={() => {}} onWork={() => {}} />);

    expect(await screen.findByText("sem checkout")).toBeInTheDocument();
  });

  it("abre a conversa com o corpo no composer, e sem enviar", async () => {
    /*
     * T6: o composer chega preenchido, **não enviado**. É a mesma regra do
     * núcleo da memória — um prompt disparado sem você ler é uma injeção que
     * custa dinheiro.
     */
    const user = userEvent.setup();
    const onWork = vi.fn();
    trpc.task.get.query.mockResolvedValue(
      task({ title: "o endpoint /orders devolve 500", body: "reproduz em staging" }),
    );
    trpc.agentConfig.list.query.mockResolvedValue([{ id: "cfg1", name: "claude" }]);
    trpc.worktree.listByProject.query.mockResolvedValue([]);
    trpc.worktree.create.mutate.mockResolvedValue({ id: "wt-novo" });
    trpc.session.createAgent.mutate.mockResolvedValue({ id: "se-nova" });

    renderUI(<TaskDetail taskId="t1" workspaceId="w1" onBack={() => {}} onWork={onWork} />);
    await user.click(await screen.findByRole("button", { name: "trabalhar nesta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "abrir" }));

    expect(trpc.worktree.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "t1", name: "o-endpoint-orders-devolve-500" }),
    );
    expect(trpc.session.createAgent.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "t1", scopeId: "wt-novo" }),
    );
    expect(onWork).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "se-nova", draft: "reproduz em staging" }),
    );
  });
});

describe("o nome derivado do título", () => {
  it.each([
    ["o endpoint /orders devolve 500", "o-endpoint-orders-devolve-500"],
    ["validar CPF no cadastro, com o dígito", "validar-cpf-no-cadastro-com"],
    ["  ???  ", "tarefa"],
  ])("%j vira %j", (title, expected) => {
    // Sugestão, não regra — o campo continua editável. O que ela garante é o
    // alfabeto que uma branch aceita.
    expect(suggestName(title)).toBe(expected);
  });
});

describe("a fila de Propostas", () => {
  const noProject = () => "acme-web";

  it("zero propostas é zero pixel", async () => {
    /*
     * Ela não tem estado vazio. Uma seção que diz "nada aqui" todo dia ensina o
     * olho a pular aquela região da tela — e no dia em que houver algo, ele pula
     * igual.
     */
    trpc.task.listByWorkspace.query.mockResolvedValue([]);
    trpc.memory.proposals.query.mockResolvedValue([]);

    const { container } = renderUI(
      <ProposalQueue workspaceId="w1" projectName={noProject} />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector(".section")).toBeNull();
  });

  it("o filtro de estado vale para os dois tipos", async () => {
    /*
     * Um segmentado que filtra metade da fila é pior que nenhum. E sem ele,
     * rejeitar apagaria a proposta da tela inteira — não está na fila, não está
     * no acervo — e você não teria como lembrar o que já decidiu.
     */
    const user = userEvent.setup();
    trpc.task.listByWorkspace.query.mockResolvedValue([
      task({ id: "t7", status: "proposed", createdBy: "agent", createdBySession: "se-1" }),
    ]);
    trpc.memory.proposals.query.mockResolvedValue([]);

    renderUI(<ProposalQueue workspaceId="w1" projectName={noProject} />);
    await user.click(await screen.findByRole("button", { name: "Resolvidas" }));

    expect(trpc.task.listByWorkspace.query).toHaveBeenCalledWith({
      workspaceId: "w1",
      status: "dropped",
    });
    expect(trpc.memory.proposals.query).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("aprovar uma tarefa proposta a torna aberta", async () => {
    const user = userEvent.setup();
    trpc.task.listByWorkspace.query.mockResolvedValue([
      task({ id: "t7", title: "o checkout lê order.total", status: "proposed", createdBy: "agent", createdBySession: "se-1" }),
    ]);
    trpc.memory.proposals.query.mockResolvedValue([]);

    renderUI(<ProposalQueue workspaceId="w1" projectName={noProject} />);
    await user.click(await screen.findByRole("button", { name: "aprovar" }));

    expect(trpc.task.setStatus.mutate).toHaveBeenCalledWith({ id: "t7", status: "open" });
  });

  it("rejeitar pede motivo antes de deixar clicar", async () => {
    // É o que ensina o agente a não propor de novo — e o daemon cobra de
    // qualquer jeito, então perguntar aqui evita um erro que ninguém pediu.
    const user = userEvent.setup();
    trpc.task.listByWorkspace.query.mockResolvedValue([
      task({ id: "t7", status: "proposed", createdBy: "agent", createdBySession: "se-1" }),
    ]);
    trpc.memory.proposals.query.mockResolvedValue([]);

    renderUI(<ProposalQueue workspaceId="w1" projectName={noProject} />);
    await user.click(await screen.findByRole("button", { name: "rejeitar" }));

    const confirm = screen.getByRole("button", { name: "rejeitar" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("por que rejeitar"), "refator sem alvo");
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(trpc.task.setStatus.mutate).toHaveBeenCalledWith({
      id: "t7",
      status: "dropped",
      reason: "refator sem alvo",
    });
  });
});
