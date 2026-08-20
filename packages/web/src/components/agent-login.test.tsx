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
  version: "0.40.0",
  versionNote: null,
  install: "npm i -g @agentclientprotocol/claude-agent-acp",
};

const AGENTS = {
  claude: {
    command: "claude",
    path: "/opt/homebrew/bin/claude",
    managed: false,
    version: "2.1.237",
    versionNote: null,
    install: null,
  },
  adapter: ADAPTER,
  apiKeyInEnv: false,
};

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

async function openPanel() {
  const user = userEvent.setup();
  renderWithProviders(<AgentLogin />);
  await user.click(await screen.findByRole("button", { name: /conectar um agente/ }));
  return user;
}

describe("the footer line", () => {
  it("says there is no agent, before anything is configured", async () => {
    renderWithProviders(<AgentLogin />);

    // One line, one verb. Before this there was nowhere to read the state of the
    // connection at all — the footer only had the button that opened a form.
    expect(await screen.findByRole("button", { name: /conectar um agente/ })).toHaveTextContent(
      "nenhum",
    );
  });

  it("says connected once the adapter answered session/new", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);

    renderWithProviders(<AgentLogin />);

    expect(await screen.findByRole("button", { name: /conectado/ })).toBeInTheDocument();
  });

  it("says expired when the adapter asked for a credential", async () => {
    // `auth_required` from `session/new`, which is the protocol's way of saying
    // "log in" — not a guess about the credential's state.
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);
    trpc.setup.probe.query.mockResolvedValue(report({ authRequired: true, authMethods: [method()] }));

    renderWithProviders(<AgentLogin />);

    expect(await screen.findByRole("button", { name: /expirado/ })).toBeInTheDocument();
  });

  it("says it failed when the handshake did", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);
    trpc.setup.probe.query.mockRejectedValue(new Error("saiu com código 127"));

    renderWithProviders(<AgentLogin />);

    expect(await screen.findByRole("button", { name: /falhou/ })).toBeInTheDocument();
  });
});

describe("choosing an agent", () => {
  it("lists what is unavailable, with the reason", async () => {
    // Making it disappear leaves the person looking for where the agent went.
    await openPanel();

    expect(await screen.findByRole("button", { name: /Codex/ })).toBeDisabled();
    expect(screen.getByText(/sem adaptador ACP publicado ainda/)).toBeInTheDocument();
  });

  it("reports the CLI it found, because that is what the adapter drives", async () => {
    await openPanel();

    expect(await screen.findByText(/encontrado na sua máquina · 2\.1\.237/)).toBeInTheDocument();
  });

  it("installs the adapter itself when it is not there, and pins what it wrote", async () => {
    // Mocked before the panel opens: the detection is a query, and one that
    // already resolved does not go back to the daemon because a test changed its
    // mind afterwards.
    trpc.setup.agents.query.mockResolvedValue({
      ...AGENTS,
      adapter: { ...ADAPTER, path: null, managed: false, version: null },
    });
    const user = await openPanel();
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
    const user = await openPanel();
    trpc.agentConfig.create.mutate.mockResolvedValue(acpConfig());

    await user.click(await screen.findByRole("button", { name: /Claude Code/ }));

    await waitFor(() => expect(trpc.agentConfig.create.mutate).toHaveBeenCalled());
    expect(trpc.setup.installAdapter.mutate).not.toHaveBeenCalled();
  });

  it("shows the daemon's own words when the install fails", async () => {
    trpc.setup.agents.query.mockResolvedValue({
      ...AGENTS,
      adapter: { ...ADAPTER, path: null, managed: false },
    });
    trpc.setup.installAdapter.mutate.mockRejectedValue(
      new Error("npm error code ENOTFOUND\nnpm error network request to registry failed"),
    );
    const user = await openPanel();

    await waitFor(() => expect(screen.getByRole("button", { name: /Claude Code/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Claude Code/ }));

    expect(await screen.findByText(/ENOTFOUND/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "tentar de novo" })).toBeInTheDocument();
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
    await openPanel();

    expect(await screen.findByRole("button", { name: /Claude Subscription/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anthropic Console/ })).toBeInTheDocument();
    expect(screen.getByText(/vieram/)).toHaveTextContent("do próprio adaptador");
  });

  it("fills exactly one of them, because one path serves almost everyone", async () => {
    await openPanel();

    const first = await screen.findByRole("button", { name: /Claude Subscription/ });
    const second = screen.getByRole("button", { name: /Anthropic Console/ });
    expect(first.className).toContain("opt--primary");
    expect(second.className).not.toContain("opt--primary");
  });

  it("asks the daemon for a method by id, never for a command", async () => {
    // A client that could name the binary would be a client that can run
    // anything on the machine the daemon is on.
    const user = await openPanel();
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
    const user = await openPanel();
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
    // An `agent` method goes through `authenticate`, which this adapter answers
    // with "Method not implemented" — so a button for it would be a lie.
    trpc.setup.probe.query.mockResolvedValue(
      report({
        authRequired: true,
        authMethods: [method({ type: "agent", command: null })],
      }),
    );

    await openPanel();

    expect(await screen.findByText(/nenhuma forma de entrar/)).toBeInTheDocument();
  });
});

describe("connected", () => {
  beforeEach(() => {
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig()]);
  });

  it("shows what the handshake reported", async () => {
    await openPanel();

    expect(await screen.findByText(/Claude Agent/)).toBeInTheDocument();
    expect(screen.getByText(/0\.40\.0/)).toBeInTheDocument();
  });

  it("has no 'sair', because the adapter does not declare it", async () => {
    // `logout` exists in ACP but is gated on `agentCapabilities.auth.logout`, and
    // this adapter sends `auth: null`. A button here would mean nothing.
    await openPanel();

    await screen.findByText(/Claude Agent/);
    expect(screen.queryByRole("button", { name: /^sair$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/auth\.logout/)).toBeInTheDocument();
  });

  it("keeps the five old fields as facts, in a drawer nobody has to open", async () => {
    const user = await openPanel();
    await screen.findByText(/Claude Agent/);

    await user.click(screen.getByRole("button", { name: "avançado" }));

    expect(screen.getByText(ADAPTER.path)).toBeInTheDocument();
    expect(screen.getByText("0.40.0")).toBeInTheDocument();
    // Read-only: the daemon owns the command and the pin.
    expect(screen.queryByLabelText("Comando")).not.toBeInTheDocument();
  });
});
