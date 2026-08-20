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
    pinned: false,
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
  trpc.memory.core.query.mockResolvedValue({ chars: 0, recentChars: 0, entries: [] });
  trpc.memory.settings.query.mockResolvedValue({
    distill: false,
    autoLearn: false,
    autoLearnBudget: 3,
  });
  trpc.memory.playbooks.query.mockResolvedValue([]);
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

  /*
   * O teste da contagem saiu daqui, e a contagem também.
   *
   * Ela era duplicada: a faixa do painel direito já mostra "Memória 1", e o
   * comentário lá diz o motivo — o número de propostas pendentes é o que decide
   * se vale abrir a aba. Renderizado em 360px, a palavra "Memória" aparecia três
   * vezes na mesma linha e a quarta aba ficava cortada. A asserção agora vive em
   * `right-panel.test.tsx`, junto do elemento que a exibe.
   */

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

  it("a proposta mostra o corpo que vai virar arquivo", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal({ body: "Preço só com plano ativo." })]);
    render();

    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));

    // Aprovar grava e commita: aprovar o que não foi lido não é revisão.
    expect(await screen.findByText("Preço só com plano ativo.")).toBeInTheDocument();
  });

  it("aprovar chama a mutation e recarrega tudo de memória", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal()]);
    trpc.memory.approveProposal.mutate.mockResolvedValue({ outcome: "applied" });
    render();
    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));
    await waitFor(() => {
      expect(trpc.memory.list.query).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(await screen.findByRole("button", { name: "Aprovar" }));

    await waitFor(() => {
      expect(trpc.memory.approveProposal.mutate).toHaveBeenCalledWith({ id: "prop1" });
    });
    // A invalidação é `["memory"]` inteiro: aprovar muda a lista, a inbox, o
    // histórico e os números. Invalidar três de quatro é como uma tela passa a
    // discordar de si mesma — e só a lista sendo buscada de novo prova isso.
    await waitFor(() => {
      expect(trpc.memory.list.query).toHaveBeenCalledTimes(2);
    });
  });

  it("editar e aprovar manda o que você corrigiu, e só isso", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal({ body: "regra" })]);
    trpc.memory.approveProposal.mutate.mockResolvedValue({ outcome: "applied" });
    render();
    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));

    await userEvent.click(await screen.findByRole("button", { name: "Editar e aprovar" }));
    const body = await screen.findByLabelText("Corpo");
    await userEvent.clear(body);
    await userEvent.type(body, "Corrigi antes de aceitar.");
    await userEvent.click(screen.getByRole("button", { name: "Aprovar com edição" }));

    await waitFor(() => {
      expect(trpc.memory.approveProposal.mutate).toHaveBeenCalledWith({
        id: "prop1",
        body: "Corrigi antes de aceitar.",
      });
    });
  });

  it("não deixa aprovar edição que apagou nome ou descrição", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal()]);
    render();
    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));
    await userEvent.click(await screen.findByRole("button", { name: "Editar e aprovar" }));

    await userEvent.clear(await screen.findByLabelText("Nome"));

    // O router recusaria com `min(1)`; barrar aqui é a diferença entre um campo
    // vazio e um banner de erro do zod.
    expect(screen.getByRole("button", { name: "Aprovar com edição" })).toBeDisabled();
  });

  it("motivo em branco não vira nota vazia no histórico", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal()]);
    trpc.memory.rejectProposal.mutate.mockResolvedValue({ status: "rejected" });
    render();
    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rejeitar" }));

    await userEvent.type(screen.getByLabelText(/Por que não/), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Rejeitar" }));

    // `resolutionNote: ""` renderizaria um parágrafo vazio nas resolvidas: só
    // `null` some, e string vazia não é `null`.
    await waitFor(() => {
      expect(trpc.memory.rejectProposal.mutate).toHaveBeenCalledWith({ id: "prop1" });
    });
  });

  it("rejeitar pede confirmação e motivo antes de resolver", async () => {
    trpc.memory.proposals.query.mockResolvedValue([proposal()]);
    trpc.memory.rejectProposal.mutate.mockResolvedValue({ status: "rejected" });
    render();
    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));

    await userEvent.click(await screen.findByRole("button", { name: "Rejeitar" }));

    // Rejeitar não tem volta e não há reabrir: um clique só seria decisão sem
    // volta tomada sem intenção.
    expect(trpc.memory.rejectProposal.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/não tem volta/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Por que não/), "regra do api");
    await userEvent.click(screen.getByRole("button", { name: "Rejeitar" }));

    await waitFor(() => {
      expect(trpc.memory.rejectProposal.mutate).toHaveBeenCalledWith({
        id: "prop1",
        note: "regra do api",
      });
    });
  });

  it("a proposta rejeitada continua visível, com o motivo", async () => {
    trpc.memory.proposals.query.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve(
        status === "resolved"
          ? [
              proposal({
                status: "rejected",
                resolvedAt: new Date("2026-08-17T15:00:00Z"),
                resolutionNote: "isso é regra do api, não do produto",
              }),
            ]
          : [],
      ),
    );
    render();
    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));

    await userEvent.click(await screen.findByRole("button", { name: "Resolvidas" }));

    // Recusar é histórico: sem esta vista a proposta desapareceria da tela
    // inteira — não está na inbox, na lista, nem no WAL.
    expect(await screen.findByText("rejeitada")).toBeInTheDocument();
    expect(screen.getByText("isso é regra do api, não do produto")).toBeInTheDocument();
  });

  it("inbox que falha diz o que falhou, e não fica carregando", async () => {
    trpc.memory.proposals.query.mockRejectedValue(new Error("daemon não respondeu"));
    render();

    await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));

    expect(await screen.findByText("Não deu para ler as propostas")).toBeInTheDocument();
    expect(screen.getByText(/daemon não respondeu/)).toBeInTheDocument();
  });

  it("histórico e números que falham também dizem o que falhou", async () => {
    trpc.memory.decisions.query.mockRejectedValue(new Error("sem WAL"));
    trpc.memory.usage.query.mockRejectedValue(new Error("sem números"));
    render();

    await userEvent.click(await screen.findByRole("tab", { name: "Histórico" }));
    expect(await screen.findByText("Não deu para ler o histórico")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Números" }));
    expect(await screen.findByText("Não deu para ler os números")).toBeInTheDocument();
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

describe("o núcleo, na tela", () => {
  it("fixar é um gesto com estado, e a entrada diz em qual", async () => {
    render();

    const button = await screen.findByRole("button", { name: "fixar no núcleo" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);

    expect(trpc.memory.pin.mutate).toHaveBeenCalledWith({
      path: "workspaces/ws1/memory/process_convencao.md",
      pinned: true,
    });
  });

  it("o custo da entrada fica ao lado do botão que o produziu", async () => {
    trpc.memory.list.query.mockResolvedValue({ entries: [entry({ pinned: true })], shadowed: [] });
    trpc.memory.core.query.mockResolvedValue({
      chars: 1_240,
      recentChars: 0,
      entries: [
        {
          path: "workspaces/ws1/memory/process_convencao.md",
          name: "Convenção de nomes",
          scope: "workspace",
          chars: 312,
        },
      ],
    });

    render();

    expect(await screen.findByRole("button", { name: "no núcleo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("312 car.")).toBeInTheDocument();
  });

  it("a marca d'água mostra o tamanho, a variação, e avisa quando é hora de consolidar", async () => {
    trpc.memory.core.query.mockResolvedValue({
      chars: 4_500,
      recentChars: 1_240,
      entries: [
        { path: "a.md", name: "A", scope: "global", chars: 3_000 },
        { path: "b.md", name: "B", scope: "workspace", chars: 1_500 },
      ],
    });

    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="numbers" />);

    expect(await screen.findByText("4.500")).toBeInTheDocument();
    expect(screen.getByText("caracteres no núcleo")).toBeInTheDocument();
    // Sem teto (D5): o alarme avisa, e não corta nada.
    expect(screen.getByText(/hora de consolidar/)).toBeInTheDocument();
    expect(screen.getByText(/1.240 entraram em 30 dias/)).toBeInTheDocument();
  });
});

describe("a destilação, na tela", () => {
  it("desligada aparece desligada, e diz como ligar", async () => {
    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="numbers" />);

    // Desligado por padrão só é honesto se for visível. Dois interruptores, e os
    // dois desligados: a destilação e a pesquisa automática.
    expect(await screen.findAllByText("off")).toHaveLength(2);
    expect(screen.getByText(/LUMEM_MEMORY_DISTILL=1/)).toBeInTheDocument();
  });

  it("ligada diz o que custa", async () => {
    trpc.memory.settings.query.mockResolvedValue({
      distill: true,
      autoLearn: false,
      autoLearnBudget: 3,
    });

    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="numbers" />);

    expect(await screen.findByText("on")).toBeInTheDocument();
    expect(screen.getByText(/custa uma sessão de destilação/)).toBeInTheDocument();
  });
});

describe("a aba de playbooks", () => {
  const playbook = (overrides: Record<string, unknown> = {}) => ({
    path: "workspaces/ws1/playbooks/investigar-teste-flaky/PLAYBOOK.md",
    slug: "investigar-teste-flaky",
    scope: "workspace",
    taskClass: "Investigar teste flaky",
    description: "o caminho que já funcionou duas vezes",
    loads: 14,
    lastLoadedAt: new Date("2026-08-18T12:00:00Z"),
    pinned: false,
    archived: false,
    lifecycle: "active",
    ...overrides,
  });

  it("mostra uso e estado, porque é disso que o ciclo de vida é derivado", async () => {
    trpc.memory.playbooks.query.mockResolvedValue([playbook()]);

    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="playbooks" />);

    expect(await screen.findByText("Investigar teste flaky")).toBeInTheDocument();
    expect(screen.getByText("14×")).toBeInTheDocument();
    expect(screen.getByText("ativo")).toBeInTheDocument();
  });

  it("o parado sugere arquivar, e arquivar é botão seu", async () => {
    trpc.memory.playbooks.query.mockResolvedValue([playbook({ lifecycle: "stale" })]);

    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="playbooks" />);

    expect(await screen.findByText("parado")).toBeInTheDocument();
    // Sugestão, nunca ação: a telemetria subconta.
    expect(screen.getByText(/talvez o procedimento tenha mudado/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "arquivar" }));

    expect(trpc.memory.archivePlaybook.mutate).toHaveBeenCalledWith({
      path: "workspaces/ws1/playbooks/investigar-teste-flaky/PLAYBOOK.md",
      archived: true,
    });
  });

  it("arquivado é uma vista, e de lá dá para voltar", async () => {
    trpc.memory.playbooks.query.mockImplementation((input?: { archived?: boolean }) =>
      Promise.resolve(
        input?.archived === true ? [playbook({ archived: true, lifecycle: "archived" })] : [],
      ),
    );

    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="playbooks" />);

    await userEvent.click(await screen.findByRole("button", { name: "arquivados" }));

    // Arquivar não apaga: uma lista que só soubesse mostrar o que está vivo
    // faria arquivar parecer deleção.
    expect(await screen.findByText("arquivado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "desarquivar" })).toBeInTheDocument();
  });

  it("nunca carregado diz isso, e não uma data inventada", async () => {
    trpc.memory.playbooks.query.mockResolvedValue([playbook({ loads: 0, lastLoadedAt: null })]);

    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="playbooks" />);

    expect(await screen.findByText("nunca carregado")).toBeInTheDocument();
  });
});

describe("a pesquisa automática, na tela", () => {
  it("ligada diz o orçamento, porque é o que limita o custo", async () => {
    trpc.memory.settings.query.mockResolvedValue({
      distill: false,
      autoLearn: true,
      autoLearnBudget: 5,
    });

    renderWithProviders(<MemoryPanel workspaceId="ws1" projectId="p1" tab="numbers" />);

    expect(await screen.findByText("pesquisa automática")).toBeInTheDocument();
    expect(screen.getByText(/até 5 por sessão/)).toBeInTheDocument();
  });
});
