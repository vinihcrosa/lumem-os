import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTrpcDefaults, trpcMock } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", () => ({ trpc: trpcMock }));

const { ProposalQueue } = await import("./index.js");
const trpc = trpcMock;

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
