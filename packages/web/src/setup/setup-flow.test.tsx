import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";
import { SetupFlow } from "./SetupFlow.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * The flow, screen by screen, against a dubbed daemon.
 *
 * The one thing these cannot check is what the nine screens look like — that is
 * what rendering the prototype and `/styleguide` is for. What they do check is the
 * part that has been wrong twice in this repo's history: that a screen reports
 * what the daemon said, not what the client hoped.
 */

function check(id: string, state: "ok" | "warn" | "fail", value: string) {
  return { id, label: id, state, value, fix: null };
}

const PREFLIGHT = {
  checks: [
    check("daemon", "ok", "v0.0.0 · escutando em 127.0.0.1:4317"),
    check("git", "ok", "2.45 · git worktree com --orphan"),
    check("node", "ok", "22.11.0 · /opt/homebrew/bin/node"),
    check("stateDir", "ok", "/tmp/lumem · registro em /tmp/lumem/lumem.db"),
    check("disk", "ok", "184 GB livres · cada worktree custa o tamanho do checkout"),
  ],
  paths: {
    stateDir: "/tmp/lumem",
    databasePath: "/tmp/lumem/lumem.db",
    worktreesDir: "/tmp/lumem/worktrees",
    transcriptsDir: "/tmp/lumem/transcripts",
  },
};

const AGENTS = {
  claude: {
    command: "claude",
    path: "/opt/homebrew/bin/claude",
    version: "2.0.14",
    versionNote: null,
    install: null,
    managed: false,
  },
  adapter: {
    command: "claude-agent-acp",
    path: "/opt/homebrew/bin/claude-agent-acp",
    version: "0.69.0",
    versionNote: null,
    install: "npm i -g @agentclientprotocol/claude-agent-acp",
    managed: false,
  },
  apiKeyInEnv: false,
};

const PROBE = {
  command: "claude-agent-acp",
  args: [] as string[],
  agentInfo: { name: "claude-agent-acp", title: null, version: "0.69.0" },
  protocolVersion: 1,
  authMethods: [] as { id: string; name: string | null }[],
  capabilities: ["loadSession", "prompt.image"],
  acpSessionId: "d81b05ee",
  modes: ["default", "plan", "bypassPermissions"],
  currentMode: "default",
  timings: { spawnMs: 600, initializeMs: 120, sessionMs: 1200 },
};

function acpConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    name: "claude",
    command: "claude-agent-acp",
    args: [],
    env: {},
    transport: "acp",
    adapterVersion: "0.69.0",
    available: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function render(onFinish = vi.fn()) {
  renderWithProviders(
    <SetupFlow daemonVersion="0.0.0" daemonUnreachable={false} onFinish={onFinish} />,
  );
  return { onFinish };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.setup.preflight.query.mockResolvedValue(PREFLIGHT);
  trpc.setup.agents.query.mockResolvedValue(AGENTS);
  trpc.setup.probe.query.mockResolvedValue(PROBE);
  trpc.agentConfig.list.query.mockResolvedValue([]);
  trpc.workspace.list.query.mockResolvedValue([]);
  trpc.session.listByScope.query.mockResolvedValue([]);
});

/** Advances past the welcome screen. */
async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Configurar em 5 passos/ }));
}

describe("welcome", () => {
  it("reads the daemon's version instead of claiming one", async () => {
    render();

    expect(await screen.findByText(/v0\.0\.0/)).toBeInTheDocument();
  });

  it("says the daemon is down, and refuses to start, when it is", async () => {
    // A welcome screen that claims a running daemon while it is down is the first
    // lie the product tells.
    renderWithProviders(
      <SetupFlow daemonVersion={null} daemonUnreachable onFinish={vi.fn()} />,
    );

    expect(
      await screen.findByRole("heading", { name: /não está respondendo/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Configurar em 5 passos/ })).toBeDisabled();
  });

  it("draws the three things the product is", async () => {
    render();

    expect(await screen.findByText("Uma tarefa, uma worktree")).toBeInTheDocument();
    expect(screen.getByText("Agente por ACP")).toBeInTheDocument();
    expect(screen.getByText("Vários ao mesmo tempo")).toBeInTheDocument();
  });
});

describe("machine step", () => {
  it("shows the five checks the daemon reported", async () => {
    const user = userEvent.setup();
    render();
    await start(user);

    const group = await screen.findByRole("group", {
      name: "o que o Lumem encontrou nesta máquina",
    });
    expect(group.querySelectorAll(".ck")).toHaveLength(5);
    expect(screen.getByText(/184 GB livres/)).toBeInTheDocument();
  });

  it("does not block on a failure — it warns", async () => {
    // git 2.29 is a problem that shows up at the first worktree, with the right
    // sentence. Nobody should be stuck on a welcome screen for it (D6).
    const user = userEvent.setup();
    trpc.setup.preflight.query.mockResolvedValue({
      ...PREFLIGHT,
      checks: [check("git", "fail", "2.29 · abaixo de 2.30, onde o comportamento muda")],
    });

    render();
    await start(user);

    expect(await screen.findByText(/abaixo de 2.30/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar/ })).toBeEnabled();
  });

  it("asks again on demand", async () => {
    const user = userEvent.setup();
    render();
    await start(user);
    await screen.findByRole("group", { name: /encontrou nesta máquina/ });

    await user.click(screen.getByRole("button", { name: "Verificar de novo" }));

    await waitFor(() => expect(trpc.setup.preflight.query).toHaveBeenCalledTimes(2));
  });
});

describe("agent step", () => {
  async function reachAgent(user: ReturnType<typeof userEvent.setup>) {
    await start(user);
    await user.click(await screen.findByRole("button", { name: /Continuar/ }));
  }

  it("reports both binaries with path and version", async () => {
    const user = userEvent.setup();
    render();
    await reachAgent(user);

    expect(await screen.findByText(/2\.0\.14 · \/opt\/homebrew\/bin\/claude/)).toBeInTheDocument();
    expect(screen.getByText(/0\.69\.0 · \/opt\/homebrew\/bin\/claude-agent-acp/)).toBeInTheDocument();
  });

  it("installs the adapter itself, into the daemon's own directory", async () => {
    /*
     * The reversal, and why it is not the thing that was refused.
     *
     * What was refused was `npm i -g` — global, possibly needing `sudo`, with
     * nowhere for the output to go. This writes inside `~/.lumem/adapters` at a
     * pinned version, needs no privilege, and can only break itself.
     */
    const user = userEvent.setup();
    trpc.setup.agents.query.mockResolvedValue({
      ...AGENTS,
      adapter: { ...AGENTS.adapter, path: null, version: null },
    });
    trpc.setup.installAdapter.mutate.mockResolvedValue({
      path: "/tmp/lumem/adapters/node_modules/.bin/claude-agent-acp",
      version: "0.40.0",
      alreadyInstalled: false,
    });

    render();
    await reachAgent(user);

    await user.click(await screen.findByRole("button", { name: /Instalar o adaptador/ }));

    await waitFor(() => expect(trpc.setup.installAdapter.mutate).toHaveBeenCalledOnce());
    // Until it is there, the step cannot continue: there is nothing to probe.
    expect(screen.getByRole("button", { name: /Testar conexão/ })).toBeDisabled();
  });

  it("falls back to the command when the install cannot work", async () => {
    // No npm, a registry behind a proxy, a mirror without the package. On that
    // machine the person still needs a way through, and it is the same command
    // the daemon would have run.
    const user = userEvent.setup();
    trpc.setup.agents.query.mockResolvedValue({
      ...AGENTS,
      adapter: { ...AGENTS.adapter, path: null, version: null },
    });
    trpc.setup.installAdapter.mutate.mockRejectedValue(new Error("spawn npm ENOENT"));

    render();
    await reachAgent(user);
    await user.click(await screen.findByRole("button", { name: /Instalar o adaptador/ }));

    expect(await screen.findByText(/ENOENT/)).toBeInTheDocument();
    expect(
      screen.getByText("npm i -g @agentclientprotocol/claude-agent-acp"),
    ).toBeInTheDocument();
  });

  it("re-reads when told the adapter was installed", async () => {
    const user = userEvent.setup();
    trpc.setup.agents.query.mockResolvedValue({
      ...AGENTS,
      adapter: { ...AGENTS.adapter, path: null, version: null },
    });

    render();
    await reachAgent(user);
    await user.click(await screen.findByRole("button", { name: /Já instalei/ }));

    await waitFor(() => expect(trpc.setup.agents.query).toHaveBeenCalledTimes(2));
  });

  it("reports the credential instead of offering a choice", async () => {
    // The adapter uses whatever it finds; a radio that changes nothing would
    // teach something false about who decides (O5).
    const user = userEvent.setup();
    render();
    await reachAgent(user);

    expect(await screen.findByText(/credencial local do Claude/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Assinatura Claude/ })).not.toBeInTheDocument();
  });

  it("says when the API key is what will be used", async () => {
    const user = userEvent.setup();
    trpc.setup.agents.query.mockResolvedValue({ ...AGENTS, apiKeyInEnv: true });

    render();
    await reachAgent(user);

    expect(await screen.findByText(/cobrança por token/)).toBeInTheDocument();
  });
});

describe("handshake step", () => {
  async function reachHandshake(user: ReturnType<typeof userEvent.setup>) {
    await start(user);
    await user.click(await screen.findByRole("button", { name: /Continuar/ }));
    await user.click(await screen.findByRole("button", { name: /Testar conexão/ }));
  }

  it("shows what the adapter answered", async () => {
    const user = userEvent.setup();
    render();
    await reachHandshake(user);

    expect(await screen.findByText(/ACP v1 · claude-agent-acp 0\.69\.0/)).toBeInTheDocument();
    expect(screen.getByText(/session\/new devolveu d81b05ee/)).toBeInTheDocument();
    expect(screen.getByText(/não pediu autenticação/)).toBeInTheDocument();
  });

  it("says no token was spent, because none was", async () => {
    const user = userEvent.setup();
    render();
    await reachHandshake(user);

    expect(await screen.findByText(/Nenhum token consumido/)).toBeInTheDocument();
  });

  it("pins the version the adapter reported, without anyone typing it", async () => {
    // The whole reason the probe exists: `adapter_version` is typed by hand in
    // the sidebar form, and the protocol has been handing the answer over all
    // along (F3.5).
    const user = userEvent.setup();
    trpc.agentConfig.create.mutate.mockResolvedValue(acpConfig());

    render();
    await reachHandshake(user);
    await user.click(await screen.findByRole("button", { name: /^Continuar/ }));

    await waitFor(() =>
      expect(trpc.agentConfig.create.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "claude-agent-acp",
          transport: "acp",
          adapterVersion: "0.69.0",
        }),
      ),
    );
  });

  it("reuses a configuration that already exists instead of failing on the name", async () => {
    const user = userEvent.setup();
    trpc.agentConfig.list.query.mockResolvedValue([acpConfig({ id: "old" })]);

    render();
    await reachHandshake(user);
    await user.click(await screen.findByRole("button", { name: /^Continuar/ }));

    await waitFor(() => expect(screen.getByText(/Toda tarefa vira uma worktree|Crie seu primeiro workspace/)).toBeInTheDocument());
    expect(trpc.agentConfig.create.mutate).not.toHaveBeenCalled();
  });

  it("shows the daemon's refusal when the handshake fails", async () => {
    const user = userEvent.setup();
    trpc.setup.probe.query.mockRejectedValue(
      new Error('"claude-agent-acp" não está no PATH do servidor'),
    );

    render();
    await reachHandshake(user);

    expect(await screen.findByRole("heading", { name: /não conectou/ })).toBeInTheDocument();
    expect(screen.getByText(/não está no PATH/)).toBeInTheDocument();
  });

  it("reports an adapter that demands authentication, with the method", async () => {
    const user = userEvent.setup();
    trpc.setup.probe.query.mockResolvedValue({
      ...PROBE,
      authMethods: [{ id: "claude-login", name: "Assinatura Claude" }],
    });

    render();
    await reachHandshake(user);

    expect(await screen.findByText(/pede autenticação: Assinatura Claude/)).toBeInTheDocument();
  });
});

describe("skipping", () => {
  it("skipping the agent skips its handshake too", async () => {
    // `handshake` is step 2 still happening. Landing on it after "pular" would
    // spawn an adapter to prove a connection the person just declined.
    const user = userEvent.setup();
    render();
    await start(user);
    await user.click(await screen.findByRole("button", { name: /Continuar/ }));
    await user.click(await screen.findByRole("button", { name: "pular este passo" }));

    expect(
      await screen.findByRole("heading", { name: "Crie seu primeiro workspace" }),
    ).toBeInTheDocument();
    expect(trpc.setup.probe.query).not.toHaveBeenCalled();
  });

  it("goes back with esc", async () => {
    const user = userEvent.setup();
    render();
    await start(user);
    await screen.findByRole("heading", { name: /O que o Lumem precisa/ });

    await user.keyboard("{Escape}");

    expect(
      await screen.findByRole("heading", { name: /O daemon já está rodando/ }),
    ).toBeInTheDocument();
  });
});

describe("workspace step", () => {
  async function reachWorkspace(user: ReturnType<typeof userEvent.setup>) {
    trpc.agentConfig.create.mutate.mockResolvedValue(acpConfig());
    await start(user);
    await user.click(await screen.findByRole("button", { name: /Continuar/ }));
    await user.click(await screen.findByRole("button", { name: /Testar conexão/ }));
    await user.click(await screen.findByRole("button", { name: /^Continuar/ }));
    await screen.findByRole("heading", { name: "Crie seu primeiro workspace" });
  }

  it("cannot be skipped, because without a workspace there is no app", async () => {
    const user = userEvent.setup();
    render();
    await reachWorkspace(user);

    expect(screen.queryByRole("button", { name: "pular este passo" })).not.toBeInTheDocument();
  });

  it("says what the daemon will write, with the daemon's own paths", async () => {
    // A client composing `~/.lumem` would be confidently wrong on the one machine
    // where someone moved `LUMEM_STATE_DIR`.
    const user = userEvent.setup();
    render();
    await reachWorkspace(user);

    expect(screen.getByText("/tmp/lumem/lumem.db")).toBeInTheDocument();
    expect(screen.getByText("/tmp/lumem/transcripts")).toBeInTheDocument();
    expect(screen.getByLabelText(/Onde ficam as worktrees/)).toHaveValue("/tmp/lumem/worktrees");
  });

  it("shows the daemon's refusal in its own words", async () => {
    const user = userEvent.setup();
    trpc.workspace.create.mutate.mockRejectedValue(
      new Error('já existe um workspace chamado "pessoal"'),
    );

    render();
    await reachWorkspace(user);
    await user.click(screen.getByRole("button", { name: /Criar workspace/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'já existe um workspace chamado "pessoal"',
    );
  });
});
