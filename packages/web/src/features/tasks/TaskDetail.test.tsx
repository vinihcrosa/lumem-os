import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTrpcDefaults, trpcMock } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", () => ({ trpc: trpcMock }));

const { TaskDetail, suggestName } = await import("./TaskDetail.js");
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
