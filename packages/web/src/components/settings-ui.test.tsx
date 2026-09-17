import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "./SettingsPanel.js";
import { renderWithProviders } from "../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * A tela de configurações, e o que ela escreve (`030-settings`, fase 2).
 *
 * O que estes casos existem para provar é a Q4: até esta feature,
 * `workspace.setBudget` **não tinha chamador na web** — os três tetos eram
 * somente-leitura no produto inteiro, e o único jeito de pôr um teto era um
 * teste. A tela é o primeiro escritor.
 */

function settings(over: Record<string, unknown> = {}) {
  return {
    autonomy: "manual",
    maxParallel: 2,
    mergedAlwaysRemoves: false,
    budget: 5,
    budgetEnv: "LUMEM_TASKS_BUDGET",
    sessions: 0,
    sessionsWithTask: 0,
    caps: { costPerTask: null, costPerDay: null, turnsPerSession: null },
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  trpc.task.settings.query.mockResolvedValue(settings());
  trpc.setup.agents.query.mockResolvedValue({ adapters: [] });
  trpc.secrets.list.query.mockResolvedValue([]);
});

function render() {
  return renderWithProviders(<SettingsPanel workspaceId="w1" workspaceName="pessoal" />);
}

describe("as quatro seções", () => {
  it("estão todas na tela, numa rolagem só", async () => {
    render();

    expect(await screen.findByRole("heading", { name: "Esteira e orçamento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agentes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Integrações" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exibição" })).toBeInTheDocument();
  });

  /*
   * A Q3, e ela é a razão da etiqueta ser por controle: `integrações` mistura
   * máquina e repositório, e `esteira` mistura workspace e máquina — a variável
   * de ambiente é do processo do daemon. Uma frase por seção teria que mentir em
   * duas das quatro.
   */
  it("uma seção pode ter linhas de donos diferentes", async () => {
    render();

    // O cabeçalho existe enquanto a leitura está em voo; as linhas não. Esperar
    // o campo é esperar a seção inteira.
    await screen.findByLabelText("teto por tarefa");
    const esteira = screen.getByRole("heading", { name: "Esteira e orçamento" }).closest("section");

    expect(esteira).not.toBeNull();
    const donos = [...(esteira?.querySelectorAll(".own") ?? [])].map((node) => node.textContent);
    expect(donos).toContain("workspace");
    expect(donos).toContain("máquina");
  });

  /*
   * A Q7: a seção existe, e o controle **não**. Desenhar o segmentado agora
   * seria um botão que não faz nada, que é a diferença entre uma tela honesta e
   * uma que promete.
   */
  it("exibição diz o que falta, e não oferece um controle morto", async () => {
    render();

    expect(await screen.findByText(/ainda não tem alavanca/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "grande" })).toBeNull();
  });
});

describe("os três tetos, que nenhuma tela escrevia", () => {
  it("sem teto aparece como palavra, e não como campo vazio sem explicação", async () => {
    render();

    const campo = await screen.findByLabelText("teto por tarefa");
    expect(campo).toHaveValue("");
    expect(campo).toHaveAttribute("placeholder", "sem teto");
  });

  it("escrever um valor grava os três de uma vez", async () => {
    const user = userEvent.setup();
    trpc.workspace.setBudget.mutate.mockResolvedValue({});
    trpc.task.settings.query.mockResolvedValue(
      settings({ caps: { costPerTask: null, costPerDay: 12, turnsPerSession: 60 } }),
    );
    render();

    const campo = await screen.findByLabelText("teto por tarefa");
    await user.click(campo);
    await user.type(campo, "3,00");
    await user.tab();

    await waitFor(() =>
      expect(trpc.workspace.setBudget.mutate).toHaveBeenCalledWith({
        id: "w1",
        costPerTask: 3,
        // Os outros dois vão junto, com o valor que estava lá: o daemon exige os
        // três, e mandar `null` no que não se mexeu apagaria um teto por acidente.
        costPerDay: 12,
        turnsPerSession: 60,
      }),
    );
  });

  /*
   * `null` é *sem teto* e `0` é *bloqueia tudo*. São coisas diferentes no banco,
   * e uma tela que as colapsasse desfaria a distinção onde ela precisa ser lida.
   */
  it("apagar o campo grava null, e escrever zero grava zero", async () => {
    const user = userEvent.setup();
    trpc.workspace.setBudget.mutate.mockResolvedValue({});
    trpc.task.settings.query.mockResolvedValue(
      settings({ caps: { costPerTask: 3, costPerDay: null, turnsPerSession: null } }),
    );
    render();

    const campo = await screen.findByLabelText("teto por tarefa");
    await waitFor(() => expect(campo).toHaveValue("3,00"));

    await user.clear(campo);
    await user.tab();
    await waitFor(() =>
      expect(trpc.workspace.setBudget.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ costPerTask: null }),
      ),
    );

    // O campo volta ao valor do servidor depois de gravar — a query é a verdade,
    // e o rascunho local morre no commit. Por isso limpar de novo antes do zero.
    await user.clear(campo);
    await user.type(campo, "0");
    await user.tab();
    await waitFor(() =>
      expect(trpc.workspace.setBudget.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ costPerTask: 0 }),
      ),
    );
  });

  it("negativo não chega ao daemon, e a linha diz por quê", async () => {
    const user = userEvent.setup();
    render();

    const campo = await screen.findByLabelText("teto por dia");
    await user.click(campo);
    await user.type(campo, "-4");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent("negativo não é teto");
    expect(trpc.workspace.setBudget.mutate).not.toHaveBeenCalled();
  });

  /*
   * Sem botão salvar, a linha é tudo o que a tela diz sobre ter gravado. A
   * recusa vem com a frase do daemon, porque ele é o único que sabe o que
   * recusou.
   */
  it("a recusa do daemon aparece na linha, com a frase dele", async () => {
    const user = userEvent.setup();
    trpc.workspace.setBudget.mutate.mockRejectedValue(new Error("workspace_budget check falhou"));
    render();

    const campo = await screen.findByLabelText("turnos por sessão");
    await user.click(campo);
    await user.type(campo, "60");
    await user.tab();

    const marca = await screen.findByTitle("workspace_budget check falhou");
    expect(marca).toHaveTextContent("não deu para salvar");
  });

  it("não grava a cada tecla", async () => {
    const user = userEvent.setup();
    trpc.workspace.setBudget.mutate.mockResolvedValue({});
    render();

    const campo = await screen.findByLabelText("teto por dia");
    await user.click(campo);
    await user.type(campo, "120");

    // `1`, `12` e `120` seriam três tetos, e o `12` existiria de verdade.
    expect(trpc.workspace.setBudget.mutate).not.toHaveBeenCalled();
  });
});

describe("a esteira", () => {
  it("o paralelismo vira campo, e vai com o degrau que já está lá", async () => {
    const user = userEvent.setup();
    trpc.workspace.setAutonomy.mutate.mockResolvedValue({});
    trpc.task.settings.query.mockResolvedValue(settings({ autonomy: "assistido", maxParallel: 2 }));
    render();

    const campo = await screen.findByLabelText("cartões em paralelo");
    await waitFor(() => expect(campo).toHaveValue("2"));
    await user.clear(campo);
    await user.type(campo, "3");
    await user.tab();

    await waitFor(() =>
      expect(trpc.workspace.setAutonomy.mutate).toHaveBeenCalledWith({
        id: "w1",
        autonomy: "assistido",
        maxParallel: 3,
      }),
    );
  });

  it("ligar um degrau manda o teto que a tela acabou de ler", async () => {
    const user = userEvent.setup();
    trpc.workspace.setAutonomy.mutate.mockResolvedValue({});
    trpc.task.settings.query.mockResolvedValue(settings({ maxParallel: 4 }));
    render();

    await user.click(await screen.findByRole("button", { name: "assistido" }));

    await waitFor(() =>
      expect(trpc.workspace.setAutonomy.mutate).toHaveBeenCalledWith({
        id: "w1",
        autonomy: "assistido",
        maxParallel: 4,
      }),
    );
  });

  /*
   * Os controles são **controlados** por `task.settings`, que não está sob o
   * prefixo `["task", "listByWorkspace"]`. Invalidando só a lista, o daemon
   * grava e a tela não muda: o degrau clicado não acende e o interruptor volta
   * ao valor antigo — um clique que desfaz a si mesmo na tela.
   *
   * O caso morou em `tasks-ui.test.tsx` até 2026-09-17, quando os degraus
   * mudaram de tela.
   */
  it("o degrau clicado relê os interruptores, e não só a lista", async () => {
    const user = userEvent.setup();
    trpc.workspace.setAutonomy.mutate.mockResolvedValue({});
    render();

    await user.click(await screen.findByRole("button", { name: "assistido" }));

    await waitFor(() => expect(trpc.task.settings.query).toHaveBeenCalledTimes(2));
  });

  /*
   * Separado da esteira de propósito: ligar a autonomia não pode parecer que
   * autoriza apagar rascunho.
   */
  it("o interruptor da limpeza é outra chamada, e outro assunto", async () => {
    const user = userEvent.setup();
    trpc.workspace.setCleanup.mutate.mockResolvedValue({});
    render();

    await user.click(
      await screen.findByRole("checkbox", { name: /PR mesclada sempre remove a worktree/ }),
    );

    await waitFor(() =>
      expect(trpc.workspace.setCleanup.mutate).toHaveBeenCalledWith({
        id: "w1",
        mergedAlwaysRemoves: true,
      }),
    );
    expect(trpc.workspace.setAutonomy.mutate).not.toHaveBeenCalled();
  });
});
