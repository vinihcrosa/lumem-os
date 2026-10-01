import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthMethodView } from "./agent-words.js";
import { LoginOptions } from "./LoginOptions.js";
import { renderWithProviders } from "../../test/render.js";
import { trpcMock as trpc } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * Entrar, método a método — o que o adaptador listou e nada além.
 *
 * Estes testes moravam em `AgentLogin.test.tsx`, atrás do painel do rodapé da
 * sidebar. O painel saiu (`039`); o `LoginOptions` não — é ele que a conta, em
 * `/settings`, monta. Então a prova é contra ele, sem a moldura de nenhum painel.
 */

function method(overrides: Partial<AuthMethodView> = {}): AuthMethodView {
  return {
    id: "claude-ai-login",
    name: "Claude Subscription",
    description: "Use Claude subscription",
    type: "terminal",
    command: "/usr/bin/node",
    args: ["/opt/bin/claude-agent-acp", "--cli", "auth", "login", "--claudeai"],
    ...overrides,
  };
}

/** Os métodos que o adaptador listou; cada `describe` escolhe os dele. */
let methods: AuthMethodView[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  methods = [];
});

/** Monta as opções de entrada de um adaptador. */
async function openAgent() {
  const user = userEvent.setup();
  renderWithProviders(
    <LoginOptions target={{ command: "claude-agent-acp", args: [] }} methods={methods} onDone={() => undefined} />,
  );
  return user;
}

describe("logging in", () => {
  beforeEach(() => {
    methods = [
      method(),
      method({ id: "console-login", name: "Anthropic Console", description: "cobrança por uso" }),
    ];
  });

  it("draws the ways in that the adapter listed, and only those", async () => {
    await openAgent();

    expect(await screen.findByRole("button", { name: /Claude Subscription/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anthropic Console/ })).toBeInTheDocument();
    expect(screen.getByText(/vieram/)).toHaveTextContent("do próprio adaptador");
  });

  it("fills exactly one of them, because one path serves almost everyone", async () => {
    await openAgent();

    const first = await screen.findByRole("button", { name: /Claude Subscription/ });
    const second = screen.getByRole("button", { name: /Anthropic Console/ });
    expect(first.className).toContain("opt--primary");
    expect(second.className).not.toContain("opt--primary");
  });

  it("asks the daemon for a method by id, never for a command", async () => {
    // A client that could name the binary would be a client that can run
    // anything on the machine the daemon is on.
    const user = await openAgent();
    trpc.setup.login.mutate.mockResolvedValue({
      ptySessionId: "pty1",
      command: "/usr/bin/node",
      args: [],
    });

    await user.click(await screen.findByRole("button", { name: /Claude Subscription/ }));

    await waitFor(() =>
      expect(trpc.setup.login.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ methodId: "claude-ai-login" }),
      ),
    );
    /*
     * It names the adapter, never the command to run inside it.
     *
     * `command`/`args` here are *which adapter to ask* — the daemon needs them to
     * stand the same adapter up and look the method's own command line up in the
     * handshake. What must never cross is the login command itself: that is what
     * would turn this into "run whatever I say on the daemon's machine".
     */
    const sent = JSON.stringify(trpc.setup.login.mutate.mock.calls[0]![0]);
    expect(sent).not.toContain("--claudeai");
    expect(sent).not.toContain("/usr/bin/node");
  });

  it("offers no 'já entrei' — the adapter is what confirms", async () => {
    const user = await openAgent();
    trpc.setup.login.mutate.mockResolvedValue({
      ptySessionId: "pty1",
      command: "/usr/bin/node",
      args: [],
    });

    await user.click(await screen.findByRole("button", { name: /Claude Subscription/ }));

    expect(await screen.findByText(/autorize no navegador e volte/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /já entrei/i })).not.toBeInTheDocument();
    expect(screen.getByText(/quem confirma é o adaptador respondendo/)).toBeInTheDocument();
  });

  it("says so when the adapter offers nothing it can run", async () => {
    /*
     * Um método `terminal` **sem comando** é o adaptador dizendo "eu mesmo", e
     * adivinhar qual dos nomes dele está nesta máquina é o palpite que já produziu
     * um comando de instalação errado. Um botão para ele seria um botão que abre
     * um terminal vazio.
     */
    methods = [method({ type: "terminal", command: null })];

    await openAgent();

    expect(await screen.findByText(/nenhuma forma de entrar/)).toBeInTheDocument();
  });
});

describe("entrar por chamada, e não por comando", () => {
  /** Os métodos do Codex: nenhum deles é `type: "terminal"` (§4.2). */
  const CODEX_METHODS = [
    {
      id: "chat-gpt",
      name: "ChatGPT",
      description: "Use ChatGPT to authenticate",
      type: "unknown",
      command: null,
      args: [],
    },
    {
      id: "chat-gpt-device-code",
      name: "ChatGPT (device code)",
      description: "Sign in by opening a verification page",
      type: "unknown",
      command: null,
      args: [],
    },
    {
      id: "api-key",
      name: "API Key",
      description: "Use an API key to authenticate",
      type: "unknown",
      command: null,
      args: [],
    },
  ];

  beforeEach(() => {
    methods = CODEX_METHODS;
  });

  it("desenha os três métodos que o adaptador ofereceu, e nenhum é comando", async () => {
    await openAgent();

    expect(await screen.findByRole("button", { name: /^ChatGPT Use/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /device code/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /API Key/ })).toBeInTheDocument();
    // Nenhum PTY: este agente não entrega comando nenhum para rodar.
    expect(trpc.setup.login.mutate).not.toHaveBeenCalled();
  });

  it("chama `authenticate` por id, sem passar por terminal", async () => {
    const user = await openAgent();
    trpc.setup.authenticate.mutate.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });
    trpc.setup.authState.query.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });

    await user.click(await screen.findByRole("button", { name: /^ChatGPT Use/ }));

    await waitFor(() =>
      expect(trpc.setup.authenticate.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ methodId: "chat-gpt" }),
      ),
    );
    expect(trpc.setup.login.mutate).not.toHaveBeenCalled();
  });

  it("mostra a URL e o código, e diz que nada abre aqui", async () => {
    /*
     * O caminho que existe por causa de uma medição: `chat-gpt` abre o navegador
     * na máquina do **daemon**, e este é o único método que não. A frase "nada
     * abre aqui" é o que a C7 obriga a dizer.
     */
    const user = await openAgent();
    trpc.setup.authenticate.mutate.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });
    trpc.setup.authState.query.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: {
        elicitationId: "e1",
        url: "https://chatgpt.com/device",
        message: "Sign in to ChatGPT and enter this code: FKPT-QJ29",
        code: "FKPT-QJ29",
      },
      message: null,
    });

    await user.click(await screen.findByRole("button", { name: /device code/ }));

    expect(await screen.findByText("FKPT-QJ29")).toBeInTheDocument();
    expect(screen.getByText("https://chatgpt.com/device")).toBeInTheDocument();
    // A frase do agente continua inteira embaixo do destaque.
    expect(screen.getByText(/enter this code/)).toBeInTheDocument();
    expect(screen.getByText(/Nada abre aqui/)).toBeInTheDocument();
  });

  it("mostra a frase do agente quando nada nela parece um código", async () => {
    const user = await openAgent();
    trpc.setup.authenticate.mutate.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });
    trpc.setup.authState.query.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: {
        elicitationId: "e1",
        url: "https://exemplo.test/autorize",
        message: "autorize no navegador e volte",
        code: null,
      },
      message: null,
    });

    await user.click(await screen.findByRole("button", { name: /device code/ }));

    expect(await screen.findByText("autorize no navegador e volte")).toBeInTheDocument();
    expect(screen.queryByText("e digite este código")).not.toBeInTheDocument();
  });

  it("cancelar é o que existe no lugar de um `já entrei`", async () => {
    const user = await openAgent();
    trpc.setup.authenticate.mutate.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });
    trpc.setup.authState.query.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });
    trpc.setup.cancelAuth.mutate.mockResolvedValue({
      id: "l1",
      state: "cancelled",
      elicitation: null,
      message: null,
    });

    await user.click(await screen.findByRole("button", { name: /^ChatGPT Use/ }));
    await user.click(await screen.findByRole("button", { name: "cancelar" }));

    await waitFor(() =>
      expect(trpc.setup.cancelAuth.mutate).toHaveBeenCalledWith({ loginId: "l1" }),
    );
    expect(screen.queryByRole("button", { name: /já entrei/ })).not.toBeInTheDocument();
  });

  it("pede a chave num campo, manda uma vez, e não a mostra de volta", async () => {
    const user = await openAgent();
    trpc.setup.authenticate.mutate.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });
    trpc.setup.authState.query.mockResolvedValue({
      id: "l1",
      state: "ok",
      elicitation: null,
      message: null,
    });

    await user.click(await screen.findByRole("button", { name: /API Key/ }));
    const field = await screen.findByLabelText("chave de API");
    await user.type(field, "sk-proj-nao-volta");
    await user.click(screen.getByRole("button", { name: "usar" }));

    await waitFor(() =>
      expect(trpc.setup.authenticate.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ methodId: "api-key", apiKey: "sk-proj-nao-volta" }),
      ),
    );
    // Apagada da tela no mesmo gesto que a envia: ela atravessa o daemon e não
    // tem por que continuar existindo aqui.
    expect(document.body.textContent).not.toContain("sk-proj-nao-volta");
  });

  it("conta a recusa do agente com a frase dele", async () => {
    const user = await openAgent();
    trpc.setup.authenticate.mutate.mockResolvedValue({
      id: "l1",
      state: "running",
      elicitation: null,
      message: null,
    });
    trpc.setup.authState.query.mockResolvedValue({
      id: "l1",
      state: "failed",
      elicitation: null,
      message: "conta sem acesso ao Codex",
    });

    await user.click(await screen.findByRole("button", { name: /^ChatGPT Use/ }));

    expect(await screen.findByText("conta sem acesso ao Codex")).toBeInTheDocument();
    // E os botões voltam: recusar não fecha o caminho, oferece outro.
    expect(screen.getByRole("button", { name: /API Key/ })).toBeInTheDocument();
  });
});
