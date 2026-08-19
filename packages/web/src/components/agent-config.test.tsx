import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { renderWithProviders } from "../test/render.js";
import { trpcMock as trpc } from "../test/trpc-mock.js";

vi.mock("../lib/trpc.js", async () => ({
  trpc: (await import("../test/trpc-mock.js")).trpcMock,
}));

/**
 * Adding an agent without leaving the app (fase 6).
 *
 * The reason this screen exists is narrow and worth restating: an ACP configuration
 * needs a `transport` (F1.2) and a pinned adapter version (F5.5), and until now no
 * screen could write either — so the only way to use the conversation at all was an
 * HTTP call by hand. What is asserted here is that the two fields reach the daemon,
 * and that the rule tying them together is enforced before the submit rather than
 * after it.
 */

function config(overrides: Record<string, unknown> = {}) {
  return {
    id: "ac1",
    name: "claude-code",
    command: "claude",
    args: [],
    env: {},
    transport: "pty",
    adapterVersion: null,
    available: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  trpc.health.query.mockResolvedValue({ ok: true, version: "0.0.0" });
  trpc.workspace.list.query.mockResolvedValue([
    { id: "w1", name: "pessoal", createdAt: new Date(), updatedAt: new Date() },
  ]);
  trpc.project.listByWorkspace.query.mockResolvedValue([]);
  trpc.project.get.query.mockResolvedValue(null);
  trpc.worktree.listByProject.query.mockResolvedValue([]);
  trpc.session.listByScope.query.mockResolvedValue([]);
  trpc.agentConfig.list.query.mockResolvedValue([]);
});

/** Opens the footer panel and returns it. */
async function panel() {
  renderWithProviders(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /agentes/ }));
  return screen.getByRole("button", { name: "adicionar" }).closest(".agents") as HTMLElement;
}

describe("adding one", () => {
  it("sends the two fields no other screen could write", async () => {
    // The whole point of the phase. `transport` and the pinned version are what turn a
    // tab into a conversation, and they were reachable only by curl.
    trpc.agentConfig.create.mutate.mockResolvedValue(config({ id: "ac2", transport: "acp" }));
    await panel();

    await userEvent.type(screen.getByLabelText("Nome"), "claude-acp");
    await userEvent.type(screen.getByLabelText("Comando"), "claude-agent-acp");
    await userEvent.type(screen.getByLabelText("Versão do adaptador"), "0.40.0");
    await userEvent.click(screen.getByRole("button", { name: "adicionar" }));

    await waitFor(() =>
      expect(trpc.agentConfig.create.mutate).toHaveBeenCalledWith({
        name: "claude-acp",
        command: "claude-agent-acp",
        args: [],
        transport: "acp",
        adapterVersion: "0.40.0",
      }),
    );
  });

  it("creates a terminal agent with no version at all", async () => {
    // The column forbids one on `pty`: it would be a claim about something that never
    // runs, and the next reader could not tell it from a real setting.
    trpc.agentConfig.create.mutate.mockResolvedValue(config({ id: "ac2" }));
    await panel();

    await userEvent.selectOptions(screen.getByLabelText("Transporte"), "pty");
    await userEvent.type(screen.getByLabelText("Nome"), "claude-pty");
    await userEvent.type(screen.getByLabelText("Comando"), "claude");
    await userEvent.click(screen.getByRole("button", { name: "adicionar" }));

    await waitFor(() =>
      expect(trpc.agentConfig.create.mutate).toHaveBeenCalledWith({
        name: "claude-pty",
        command: "claude",
        args: [],
        transport: "pty",
      }),
    );
  });

  it("hides the version field on a terminal agent", async () => {
    await panel();

    expect(screen.getByLabelText("Versão do adaptador")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Transporte"), "pty");

    expect(screen.queryByLabelText("Versão do adaptador")).not.toBeInTheDocument();
  });

  it("will not submit an ACP agent without a version", async () => {
    /*
     * D17: the daemon's CHECK, repeated. Without this the only way to learn the field
     * is required is to submit and read a refusal — and this is the rule that decides
     * whether the tab is a conversation or a terminal.
     */
    await panel();

    await userEvent.type(screen.getByLabelText("Nome"), "claude-acp");
    await userEvent.type(screen.getByLabelText("Comando"), "claude-agent-acp");

    expect(screen.getByRole("button", { name: "adicionar" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Versão do adaptador"), "0.40.0");

    expect(screen.getByRole("button", { name: "adicionar" })).toBeEnabled();
  });

  it("splits the arguments the way a command line is written", async () => {
    trpc.agentConfig.create.mutate.mockResolvedValue(config({ id: "ac2" }));
    await panel();

    await userEvent.selectOptions(screen.getByLabelText("Transporte"), "pty");
    await userEvent.type(screen.getByLabelText("Nome"), "eco");
    await userEvent.type(screen.getByLabelText("Comando"), "sh");
    await userEvent.type(screen.getByLabelText("Argumentos (opcional)"), "  -c   echo ola  ");
    await userEvent.click(screen.getByRole("button", { name: "adicionar" }));

    await waitFor(() =>
      expect(trpc.agentConfig.create.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ args: ["-c", "echo", "ola"] }),
      ),
    );
  });

  it("says what the daemon refused, in the daemon's words", async () => {
    // A duplicate name is the common one, and only the daemon knows which of its
    // constraints said no.
    trpc.agentConfig.create.mutate.mockRejectedValue(
      new Error('já existe uma configuração chamada "claude-acp"'),
    );
    await panel();

    await userEvent.type(screen.getByLabelText("Nome"), "claude-acp");
    await userEvent.type(screen.getByLabelText("Comando"), "claude-agent-acp");
    await userEvent.type(screen.getByLabelText("Versão do adaptador"), "0.40.0");
    await userEvent.click(screen.getByRole("button", { name: "adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("já existe uma configuração");
  });

  it("makes the new agent reachable from the session menu without a reload", async () => {
    /*
     * One query key, two readers. The menu is where the user goes next, and an agent
     * that existed on the daemon but not in the menu until a refresh would look like
     * the creation had failed.
     */
    trpc.agentConfig.create.mutate.mockResolvedValue(config({ id: "ac2" }));
    await panel();

    await userEvent.selectOptions(screen.getByLabelText("Transporte"), "pty");
    await userEvent.type(screen.getByLabelText("Nome"), "eco");
    await userEvent.type(screen.getByLabelText("Comando"), "sh");
    trpc.agentConfig.list.query.mockResolvedValue([config({ id: "ac2", name: "eco" })]);
    await userEvent.click(screen.getByRole("button", { name: "adicionar" }));

    /*
     * Scoped to the name, not to the text.
     *
     * The remove button carries the agent's name in `sr-only` — it is what gives each
     * row's button an accessible name of its own — so a bare `getByText("eco")` matches
     * twice. The same trap `testing.md` already records about accessible names that
     * grow.
     */
    await waitFor(() =>
      expect(screen.getByText("eco", { selector: ".agents__name" })).toBeInTheDocument(),
    );
    expect(trpc.agentConfig.list.query).toHaveBeenCalledTimes(2);
  });

  it("clears the form so the next one starts empty", async () => {
    trpc.agentConfig.create.mutate.mockResolvedValue(config({ id: "ac2" }));
    await panel();

    await userEvent.selectOptions(screen.getByLabelText("Transporte"), "pty");
    await userEvent.type(screen.getByLabelText("Nome"), "eco");
    await userEvent.type(screen.getByLabelText("Comando"), "sh");
    await userEvent.click(screen.getByRole("button", { name: "adicionar" }));

    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue(""));
  });
});

describe("the list", () => {
  it("says which agent is a conversation and which is a terminal", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([
      config({ id: "ac1", name: "claude-code", transport: "pty" }),
      config({
        id: "ac2",
        name: "claude-acp",
        command: "claude-agent-acp",
        transport: "acp",
        adapterVersion: "0.40.0",
      }),
    ]);

    const box = await panel();

    expect(within(box).getByText("conversa")).toBeInTheDocument();
    expect(within(box).getByText("terminal")).toBeInTheDocument();
    // The pinned version is on screen: it is the answer to "which adapter is this",
    // and A12 made it data precisely so it could be read.
    expect(within(box).getByText(/claude-agent-acp @0\.40\.0/)).toBeInTheDocument();
  });

  it("marks an agent whose command is not installed, in the menu's words", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([config({ available: false })]);

    const box = await panel();

    expect(within(box).getByText("fora do PATH")).toBeInTheDocument();
  });

  it("says so when there is none", async () => {
    const box = await panel();

    expect(within(box).getByText("nenhum agente configurado")).toBeInTheDocument();
  });

  it("asks twice before removing", async () => {
    // One click is a mis-click away from retyping four fields.
    trpc.agentConfig.list.query.mockResolvedValue([config()]);
    trpc.agentConfig.remove.mutate.mockResolvedValue({ ok: true });
    await panel();

    await userEvent.click(screen.getByRole("button", { name: /remover/ }));
    expect(trpc.agentConfig.remove.mutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "confirmar" }));

    await waitFor(() => expect(trpc.agentConfig.remove.mutate).toHaveBeenCalledWith({ id: "ac1" }));
  });

  it("shows the refusal when the agent is still in use", async () => {
    // The daemon's ON DELETE RESTRICT is the real guard, and the reason has to reach
    // the screen: "não deu" leaves nothing to act on.
    trpc.agentConfig.list.query.mockResolvedValue([config()]);
    trpc.agentConfig.remove.mutate.mockRejectedValue(
      new Error("a configuração ainda está em uso por alguma sessão"),
    );
    await panel();

    await userEvent.click(screen.getByRole("button", { name: /remover/ }));
    await userEvent.click(screen.getByRole("button", { name: "confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ainda está em uso");
  });
});
