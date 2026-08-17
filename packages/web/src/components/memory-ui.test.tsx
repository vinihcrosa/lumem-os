import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

import { MemoryPanel } from "./MemoryPanel.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

const stamps = { createdAt: new Date("2026-08-17T12:00:00Z"), updatedAt: new Date("2026-08-17T12:00:00Z") };

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    path: "workspaces/ws1/memory/process_convencao.md",
    type: "process",
    scope: "workspace",
    slug: "convencao",
    workspaceId: "ws1",
    projectId: null,
    name: "Convenção de nomes",
    description: "camelCase em todo o workspace",
    sourceActor: "human",
    confidence: "high",
    contentHash: "h",
    ...stamps,
    ...overrides,
  };
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
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
    ...stamps,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  trpc.memory.list.query.mockResolvedValue({ entries: [entry()], shadowed: [] });
  trpc.memory.proposals.query.mockResolvedValue([]);
  trpc.memory.decisions.query.mockResolvedValue([]);
  trpc.memory.usage.query.mockResolvedValue([]);
});

function render() {
  renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" />);
}

describe("MemoryPanel", () => {
  it("mostra escopo e tipo como coisas diferentes", async () => {
    render();

    // Escopo responde "onde vale"; tipo responde "o que é". A renderização do
    // protótipo provou que peso igual apaga a distinção.
    expect(await screen.findByText("workspace")).toBeInTheDocument();
    expect(screen.getByText("process")).toBeInTheDocument();
    expect(screen.getByText("Convenção de nomes")).toBeInTheDocument();
  });

  it("mostra a memória sombreada e diz quem a sombreou", async () => {
    trpc.memory.list.query.mockResolvedValue({
      entries: [entry({ scope: "project", path: "p.md" })],
      shadowed: [{ winner: "p.md", loser: "w.md", identity: "process/convencao" }],
    });

    render();

    // Esconder sem explicar é como o shadow vira mistério.
    expect(await screen.findByText(/sombreia/)).toBeInTheDocument();
    expect(screen.getByText("process/convencao")).toBeInTheDocument();
  });

  it("conta as propostas pendentes no cabeçalho", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal(), proposal({ id: "prop2" })]);

    render();

    expect(await screen.findByTitle("propostas aguardando revisão")).toHaveTextContent("2");
  });

  it("a proposta com evidência mostra a evidência; sem, diz que é conclusão", async () => {
    trpc.memory.proposals.query.mockResolvedValue([
      proposal(),
      proposal({ id: "prop2", name: "Squash", evidence: null }),
    ]);
    render();

    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));

    expect(await screen.findByText("api/src/billing/plan.ts:88")).toBeInTheDocument();
    // D7: fato vira memória, conclusão vira proposta — e a tela diz qual é qual.
    expect(screen.getByText(/Sem evidência verificável/)).toBeInTheDocument();
  });

  it("aprovar chama a mutation e recarrega tudo de memória", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal()]);
    trpc.memory.approveProposal.mutate.mockResolvedValue({ outcome: "applied" });
    render();
    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));

    await userEvent.click(await screen.findByRole("button", { name: "Aprovar" }));

    await waitFor(() => {
      expect(trpc.memory.approveProposal.mutate).toHaveBeenCalledWith({ id: "prop1" });
    });
  });

  it("o histórico mostra o que NÃO virou arquivo", async () => {
    trpc.memory.decisions.query.mockResolvedValue([
      {
        id: "d1",
        path: "memory/user_chave.md",
        operation: "add",
        outcome: "rejected",
        actor: "agent",
        confidence: "medium",
        candidateHash: "h",
        ruleTrace: ["aws_access_key"],
        reason: "parece conter credencial (aws_access_key)",
        commitSha: null,
        idempotencyKey: "k",
        ...stamps,
      },
    ]);
    render();

    await userEvent.click(await screen.findByRole("tab", { name: "Histórico" }));

    // Rejeição só existe no WAL: é a resposta para "por que isso não foi salvo?".
    expect(await screen.findByText("recusou")).toBeInTheDocument();
    expect(screen.getByText(/credencial/)).toBeInTheDocument();
  });

  it("estado vazio diz o que fazer, e não só que está vazio", async () => {
    trpc.memory.list.query.mockResolvedValue({ entries: [], shadowed: [] });

    render();

    expect(await screen.findByText("Nada aprendido ainda")).toBeInTheDocument();
  });
});
