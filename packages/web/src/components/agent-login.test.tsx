import { CLAUDE_ADAPTER } from "@lumem/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentLogin } from "./AgentLogin.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * Conectar um agente, state by state.
 *
 * What these are really guarding is that the panel draws the *adapter's* answer
 * and never its own: the login buttons come from `authMethods`, the connection
 * state comes from whether `session/new` worked, and neither is a list this
 * client keeps. The measurement that produced this design — that the adapter
 * offers nothing to a client which does not declare `auth.terminal`, and offers
 * two `type: "terminal"` methods to one that does — lives in the daemon's tests.
 */

const ADAPTER = {
  command: "claude-agent-acp",
  path: "/Users/eu/.lumem/adapters/node_modules/.bin/claude-agent-acp",
  managed: true,
  // The pin, because this fixture is "already installed and current". A stale
  // one is its own case below, and the difference decides whether the panel
  // reinstalls (LUM-54).
  version: CLAUDE_ADAPTER.pinnedVersion,
  versionNote: null,
  install: "npm i -g @agentclientprotocol/claude-agent-acp",
};

interface BinaryFixture {
  command: string;
  path: string | null;
  version: string | null;
  versionNote: string | null;
  install: string | null;
  managed: boolean;
}

const CLAUDE_ENTRY: {
  id: string;
  label: string;
  cli: BinaryFixture | null;
  adapter: BinaryFixture;
  apiKeyEnv: string | null;
} = {
  id: "claude",
  label: "Claude Code",
  cli: {
    command: "claude",
    path: "/opt/homebrew/bin/claude",
    managed: false,
    version: "2.1.237",
    versionNote: null,
    install: null,
  },
  adapter: ADAPTER,
  apiKeyEnv: null,
};

/** O relatório por adaptador (`second-agent`, F1): uma entrada por spec. */
const AGENTS = { adapters: [CLAUDE_ENTRY] };

/** O mesmo relatório com a entrada do Claude trocada por uma variação. */
function agentsWith(overrides: Partial<typeof CLAUDE_ENTRY>) {
  return { adapters: [{ ...CLAUDE_ENTRY, ...overrides }] };
}

function method(overrides: Record<string, unknown> = {}) {
  return {
    id: "claude-ai-login",
    name: "Claude Subscription",
    description: "Use Claude subscription",
    type: "terminal",
    command: "/usr/bin/node",
    args: ["/opt/bin/claude-agent-acp", "--cli", "auth", "login", "--claudeai"],
    label: "Claude Login",
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    command: "claude-agent-acp",
    args: [],
    agentInfo: { name: "@agentclientprotocol/claude-agent-acp", title: "Claude Agent", version: "0.40.0" },
    protocolVersion: 1,
    authMethods: [],
    authRequired: false,
    capabilities: ["loadSession"],
    acpSessionId: "a60458b8",
    modes: ["default", "plan"],
    currentMode: "default",
    timings: { spawnMs: 600, initializeMs: 120, sessionMs: 900 },
    ...overrides,
  };
}

function acpConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    name: "claude",
    command: ADAPTER.path,
    args: [],
    env: {},
    transport: "acp",
    adapterVersion: "0.40.0",
    available: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.setup.agents.query.mockResolvedValue(AGENTS);
  trpc.setup.probe.query.mockResolvedValue(report());
});

/**
 * Abrir o painel do `＋`: **conectar** um agente.
 *
 * Duas portas desde a `second-agent` (C8): o `＋` do cabeçalho conecta o próximo
 * agente, e a linha abre o painel do agente dela. Antes as duas eram a mesma
 * coisa, porque a linha era ao mesmo tempo estado e verbo.
 */
async function openConnect() {
  const user = userEvent.setup();
  renderWithProviders(<AgentLogin />);
  await user.click(await screen.findByRole("button", { name: /conectar um agente/ }));
  return user;
}

/** Abrir o painel de **um** agente, clicando na linha dele. */
async function openAgent(name = "claude") {
  const user = userEvent.setup();
  renderWithProviders(<AgentLogin />);
  await user.click(await screen.findByRole("button", { name: new RegExp(`^${name}:`) }));
  return user;
}

describe("o rodapé de agentes", () => {
  it("com zero agentes, tem o `＋` e uma linha que relata — não dois botões", async () => {
    /*
     * A C8: a linha é estado, o `＋` é verbo. Com zero agentes não há estado para
     * relatar numa linha clicável, e um segundo botão para a mesma ação é
     * exatamente o que a pergunta recusou.
     */
    renderWithProviders(<AgentLogin />);

    expect(await screen.findByText("nenhum agente conectado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /conectar um agente/ })).toBeInTheDocument();
    // O cabeçalho existe mesmo vazio: é onde a ação mora.
    expect(screen.getByText("Agentes")).toBeInTheDocument();
  });

  it("says connected once the adapter answered session/new", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);

    renderWithProviders(<AgentLogin />);

    expect(await screen.findByRole("button", { name: /claude: conectado/ })).toBeInTheDocument();
  });

  it("diz `entrar` quando o adaptador pediu credencial", async () => {
    /*
     * `auth_required` do `session/new`, que é como o protocolo diz "faça login" —
     * e não um palpite sobre o estado da credencial.
     *
     * O rótulo é **âmbar e é um verbo**, o terceiro estado que o desenho do segundo
     * agente acrescentou: instalado e sem credencial não é `nenhum` (cinza, "não
     * existe") nem `falhou` (vermelho, "quebrou"). É uma pendência com saída, e a
     * saída é clicar na linha.
     */
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);
    trpc.setup.probe.query.mockResolvedValue(report({ authRequired: true, authMethods: [method()] }));

    renderWithProviders(<AgentLogin />);

    const row = await screen.findByRole("button", { name: /claude: entrar/ });
    expect(row.className).toContain("foot-row--warn");
  });

  it("says it failed when the handshake did", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);
    trpc.setup.probe.query.mockRejectedValue(new Error("saiu com código 127"));

    renderWithProviders(<AgentLogin />);

    expect(await screen.findByRole("button", { name: /claude: falhou/ })).toBeInTheDocument();
  });

  it("dá uma linha por agente, com o estado de cada um", async () => {
    // A feature inteira em um teste: dois agentes, dois estados, duas linhas.
    trpc.agentConfig.list.query.mockResolvedValue([
      acpConfig(),
      acpConfig({ id: "a2", name: "codex", command: "/adapters/codex/bin/codex-acp" }),
    ]);
    trpc.setup.probe.query.mockImplementation(({ command }: { command: string }) =>
      Promise.resolve(
        command.includes("codex")
          ? report({ authRequired: true, authMethods: [method()] })
          : report(),
      ),
    );

    renderWithProviders(<AgentLogin />);

    expect(await screen.findByRole("button", { name: /claude: conectado/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /codex: entrar/ })).toBeInTheDocument();
  });

  it("marca a linha que abriu o painel", async () => {
    // Com duas linhas, um painel sem dono obriga a ler o título para saber de
    // quem ele é.
    trpc.agentConfig.list.query.mockResolvedValue([
      acpConfig(),
      acpConfig({ id: "a2", name: "codex", command: "/adapters/codex/bin/codex-acp" }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<AgentLogin />);

    await user.click(await screen.findByRole("button", { name: /^codex:/ }));

    expect(screen.getByRole("button", { name: /^codex:/ }).className).toContain("is-open");
    expect(screen.getByRole("button", { name: /^claude:/ }).className).not.toContain("is-open");
  });
});

describe("choosing an agent", () => {
  it("lista o catálogo do daemon, e não uma lista desta tela", async () => {
    // As duas specs de `ADAPTERS`. Sumir com uma delas deixaria a pessoa
    // procurando onde foi o agente.
    await openConnect();

    expect(await screen.findByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Codex/ })).toBeInTheDocument();
  });

  it("diz que o adaptador do Codex traz o próprio agente dentro", async () => {
    /*
     * A diferença medida entre os dois (§4.8): um dirige um `claude` que tem que
     * existir, o outro traz o `@openai/codex` dentro e responde o handshake com
     * `PATH=/nonexistent`. A linha do catálogo diz qual é qual **antes** do
     * clique.
     */
    await openConnect();

    expect(
      await screen.findByText(/o adaptador traz o próprio agente dentro/),
    ).toBeInTheDocument();
  });

  it("reports the CLI it found, because that is what the adapter drives", async () => {
    await openConnect();

    expect(await screen.findByText(/claude encontrado · 2\.1\.237/)).toBeInTheDocument();
  });

  it("installs the adapter itself when it is not there, and pins what it wrote", async () => {
    // Mocked before the panel opens: the detection is a query, and one that
    // already resolved does not go back to the daemon because a test changed its
    // mind afterwards.
    trpc.setup.agents.query.mockResolvedValue(
      agentsWith({ adapter: { ...ADAPTER, path: null, managed: false, version: null } }),
    );
    const user = await openConnect();
    trpc.setup.installAdapter.mutate.mockResolvedValue({
      path: ADAPTER.path,
      version: "0.40.0",
      alreadyInstalled: false,
    });
    trpc.agentConfig.create.mutate.mockResolvedValue(acpConfig());

    await waitFor(() => expect(screen.getByRole("button", { name: /Claude Code/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Claude Code/ }));

    await waitFor(() => expect(trpc.setup.installAdapter.mutate).toHaveBeenCalledOnce());
    // The version written is the one the handshake reported, never one typed.
    await waitFor(() =>
      expect(trpc.agentConfig.create.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ transport: "acp", adapterVersion: "0.40.0", command: ADAPTER.path }),
      ),
    );
  });

  it("does not install what is already installed", async () => {
    const user = await openConnect();
    trpc.agentConfig.create.mutate.mockResolvedValue(acpConfig());

    await user.click(await screen.findByRole("button", { name: /Claude Code/ }));

    await waitFor(() => expect(trpc.agentConfig.create.mutate).toHaveBeenCalled());
    expect(trpc.setup.installAdapter.mutate).not.toHaveBeenCalled();
  });

  it("reinstalls what is there in a version the product no longer pins", async () => {
    /*
     * LUM-54. `0.40.0` embeds Claude Code `2.1.160`, and the API refuses the
     * model this account defaults to — so connecting to what was already there
     * produced a session where every turn died. Only the absence of the binary
     * used to trigger an install, which made bumping the pin a fix for new
     * machines only.
     */
    trpc.setup.agents.query.mockResolvedValue(
      agentsWith({ adapter: { ...ADAPTER, version: "0.40.0" } }),
    );
    const user = await openConnect();
    trpc.setup.installAdapter.mutate.mockResolvedValue({
      path: ADAPTER.path,
      version: CLAUDE_ADAPTER.pinnedVersion,
      alreadyInstalled: false,
    });
    trpc.agentConfig.create.mutate.mockResolvedValue(acpConfig());

    await waitFor(() => expect(screen.getByRole("button", { name: /Claude Code/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Claude Code/ }));

    await waitFor(() => expect(trpc.setup.installAdapter.mutate).toHaveBeenCalledOnce());
  });

  it("connects a version it could not read rather than downloading 255 MB on a guess", async () => {
    // `null` is "nobody said", not "it is old": the adapter that answers
    // `--version` with nothing is exactly the one this case protects, and the
    // probe is what decides whether it works.
    trpc.setup.agents.query.mockResolvedValue(
      agentsWith({ adapter: { ...ADAPTER, version: null, versionNote: "não disse a versão" } }),
    );
    const user = await openConnect();
    trpc.agentConfig.create.mutate.mockResolvedValue(acpConfig());

    await waitFor(() => expect(screen.getByRole("button", { name: /Claude Code/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Claude Code/ }));

    await waitFor(() => expect(trpc.agentConfig.create.mutate).toHaveBeenCalled());
    expect(trpc.setup.installAdapter.mutate).not.toHaveBeenCalled();
  });

  it("shows the daemon's own words when the install fails", async () => {
    trpc.setup.agents.query.mockResolvedValue(
      agentsWith({ adapter: { ...ADAPTER, path: null, managed: false } }),
    );
    trpc.setup.installAdapter.mutate.mockRejectedValue(
      new Error("npm error code ENOTFOUND\nnpm error network request to registry failed"),
    );
    const user = await openConnect();

    await waitFor(() => expect(screen.getByRole("button", { name: /Claude Code/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Claude Code/ }));

    // A frase do `npm`, literal, e a lista de novo atrás dela: o painel de
    // conectar não vira um painel de erro — ele mostra o erro e continua sendo a
    // lista, porque tentar outro agente é uma saída legítima.
    expect(await screen.findByText(/ENOTFOUND/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
  });
});

describe("logging in", () => {
  beforeEach(() => {
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);
    trpc.setup.probe.query.mockResolvedValue(
      report({
        authRequired: true,
        authMethods: [
          method(),
          method({ id: "console-login", name: "Anthropic Console", description: "cobrança por uso" }),
        ],
      }),
    );
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
    trpc.setup.probe.query.mockResolvedValue(
      report({
        authRequired: true,
        authMethods: [method({ type: "terminal", command: null })],
      }),
    );

    await openAgent();

    expect(await screen.findByText(/nenhuma forma de entrar/)).toBeInTheDocument();
  });
});

describe("connected", () => {
  beforeEach(() => {
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);
  });

  it("shows what the handshake reported", async () => {
    await openAgent();

    // Escopado no painel: a linha do rodapé também carrega o nome, e um matcher
    // solto acha os dois — é a mesma regra de locator do resto da suíte.
    const panel = await screen.findByRole("group", { name: /agente claude/ });
    expect(panel).toHaveTextContent("Claude Agent");
    expect(panel).toHaveTextContent("0.40.0");
  });

  it("has no 'sair', because the adapter does not declare it", async () => {
    // `logout` exists in ACP but is gated on `agentCapabilities.auth.logout`, and
    // this adapter sends `auth: null`. A button here would mean nothing.
    await openAgent();

    const panel = await screen.findByRole("group", { name: /agente claude/ });
    expect(screen.queryByRole("button", { name: /^sair$/ })).not.toBeInTheDocument();
    expect(panel).toHaveTextContent("auth.logout");
  });

  it("keeps the five old fields as facts, in a drawer nobody has to open", async () => {
    const user = await openAgent();
    await screen.findByRole("group", { name: /agente claude/ });

    await user.click(screen.getByRole("button", { name: "avançado" }));

    expect(screen.getByText(ADAPTER.path)).toBeInTheDocument();
    expect(screen.getByText("0.40.0")).toBeInTheDocument();
    // Read-only: the daemon owns the command and the pin.
    expect(screen.queryByLabelText("Comando")).not.toBeInTheDocument();
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
      label: null,
    },
    {
      id: "chat-gpt-device-code",
      name: "ChatGPT (device code)",
      description: "Sign in by opening a verification page",
      type: "unknown",
      command: null,
      args: [],
      label: null,
    },
    {
      id: "api-key",
      name: "API Key",
      description: "Use an API key to authenticate",
      type: "unknown",
      command: null,
      args: [],
      label: null,
    },
  ];

  beforeEach(() => {
    trpc.agentConfig.list.query.mockResolvedValue([
      acpConfig({ id: "c1", name: "codex", command: "/adapters/codex/bin/codex-acp" }),
    ]);
    trpc.setup.probe.query.mockResolvedValue(
      report({ authRequired: true, authMethods: CODEX_METHODS }),
    );
  });

  it("desenha os três métodos que o adaptador ofereceu, e nenhum é comando", async () => {
    await openAgent("codex");

    expect(await screen.findByRole("button", { name: /^ChatGPT Use/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /device code/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /API Key/ })).toBeInTheDocument();
    // Nenhum PTY: este agente não entrega comando nenhum para rodar.
    expect(trpc.setup.login.mutate).not.toHaveBeenCalled();
  });

  it("chama `authenticate` por id, sem passar por terminal", async () => {
    const user = await openAgent("codex");
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
    const user = await openAgent("codex");
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
    const user = await openAgent("codex");
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
    const user = await openAgent("codex");
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
    const user = await openAgent("codex");
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
    const user = await openAgent("codex");
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

