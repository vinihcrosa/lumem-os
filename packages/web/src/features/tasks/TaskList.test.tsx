import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTrpcDefaults, trpcMock } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", () => ({ trpc: trpcMock }));

const { TaskList } = await import("./TaskList.js");
const trpc = trpcMock;

/**
 * A lista de tarefas (`022-workspace-tasks` T8).
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

  /*
   * Os tetos, os degraus da esteira, o paralelismo, a variável de ambiente e o
   * interruptor de limpeza **saíram desta tela** (`030-settings`, T13). Os casos
   * que os cobriam moraram aqui até 2026-09-17 e agora vivem em
   * `settings-ui.test.tsx`, contra a tela que os escreve — que é mais do que
   * eles provavam aqui, porque aqui eles eram só leitura.
   *
   * O que ficou é a **medida**: configuração se ajusta, medida se olha (Q9).
   */

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
    trpc.task.listByWorkspace.query.mockResolvedValue([task({ title: "uma tarefa" })]);

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);

    // A lista está na tela — é ela que prova que o `some` é da proporção e não
    // de uma leitura que não voltou.
    expect(await screen.findByText("uma tarefa")).toBeInTheDocument();
    expect(screen.queryByText(/sessões têm tarefa/)).not.toBeInTheDocument();
  });

  /*
   * O que a T13 comprou, dito como asserção: a lista **não tem mais** nenhum
   * controle de configuração. Sem este caso, alguém devolve um interruptor para
   * cá numa tarde e nada reclama.
   */
  it("não tem mais nenhum controle de configuração", async () => {
    trpc.task.listByWorkspace.query.mockResolvedValue([task({ title: "uma tarefa" })]);
    trpc.task.settings.query.mockResolvedValue({
      budget: 5,
      budgetEnv: "LUMEM_TASKS_BUDGET",
      sessions: 12,
      sessionsWithTask: 4,
      caps: { costPerTask: 2, costPerDay: 30, turnsPerSession: 60 },
      autonomy: "assistido",
      maxParallel: 2,
      mergedAlwaysRemoves: true,
    });

    renderUI(<TaskList workspaceId="w1" onOpen={() => {}} />);
    await screen.findByText("uma tarefa");

    expect(screen.queryByRole("button", { name: "assistido" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("LUMEM_TASKS_BUDGET")).toBeNull();
    expect(screen.queryByText(/sem teto/)).toBeNull();
    expect(screen.queryByText(/em paralelo/)).toBeNull();
    // E a medida continua: ela não é configuração.
    expect(screen.getByText("4 de 12")).toBeInTheDocument();
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
