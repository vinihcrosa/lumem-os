import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";
import { renderWithProviders } from "./test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "./test/trpc-mock.js";

vi.mock("./lib/trpc.js", async () => ({
  trpc: (await import("./test/trpc-mock.js")).trpcMock,
}));

/**
 * Adding an agent without leaving the app (fase 6).
 *
 * The reason this screen exists is narrow and worth restating: an ACP configuration
 * needs a pinned adapter version (F5.5), and until now no screen could write it — so
 * the only way to use the conversation at all was an HTTP call by hand. There is no
 * transport to choose any more (`033` F1.1): every configuration is an ACP adapter,
 * and the version is required on every one of them, before the submit rather than
 * after it.
 */

function config(overrides: Record<string, unknown> = {}) {
  return {
    id: "ac1",
    name: "claude-code",
    command: "claude",
    args: [],
    env: {},
    adapterVersion: "0.40.0",
    retiredAt: null,
    available: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // `resetAllMocks` apaga implementação: sem isto, as queries que a tela do
  // workspace faz no `mount` voltam a devolver `undefined`, e o banner de erro
  // aparece como um `role="alert"` a mais num teste que não fala de erro.
  installTrpcDefaults();
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

/**
 * Opens the footer panel and returns it.
 *
 * Two clicks now, and the second one is the point: the footer's action became
 * "conectar um agente", and this form is the drawer behind "outro agente ACP…" —
 * the one path that still needs five fields, because it is for an adapter the
 * daemon neither installs nor can name.
 */
async function panel() {
  renderWithProviders(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /conectar um agente/ }));
  await userEvent.click(await screen.findByRole("button", { name: /outro agente ACP/ }));
  return screen.getByRole("button", { name: "adicionar" }).closest(".agents") as HTMLElement;
}

describe("adding one", () => {
  it("sends the pinned version no other screen could write, and no transport", async () => {
    // The whole point of the phase: the pinned version was reachable only by curl.
    // And the field that used to sit beside it is gone from the wire — the daemon
    // has no column for it since `033`, and a stray key would be a claim about
    // something the product no longer does.
    trpc.agentConfig.create.mutate.mockResolvedValue(config({ id: "ac2" }));
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
        adapterVersion: "0.40.0",
      }),
    );
  });

  it("offers no transport to choose: an agent is always a conversation", async () => {
    // `033` F1.1. Disabling the field would still say there is a choice.
    const box = await panel();

    expect(screen.queryByLabelText("Transporte")).not.toBeInTheDocument();
    expect(within(box).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(box).queryByText(/terminal \(PTY\)/)).not.toBeInTheDocument();
  });

  it("will not submit an ACP agent without a version", async () => {
    /*
     * D17: the daemon's rule, repeated. Without this the only way to learn the field
     * is required is to submit and read a refusal.
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

    await userEvent.type(screen.getByLabelText("Nome"), "eco");
    await userEvent.type(screen.getByLabelText("Comando"), "sh");
    await userEvent.type(screen.getByLabelText("Argumentos (opcional)"), "  -c   echo ola  ");
    await userEvent.type(screen.getByLabelText("Versão do adaptador"), "0.40.0");
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

    await userEvent.type(screen.getByLabelText("Nome"), "eco");
    await userEvent.type(screen.getByLabelText("Comando"), "sh");
    await userEvent.type(screen.getByLabelText("Versão do adaptador"), "0.40.0");
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
    /*
     * Asserted as an outcome, not as a call count.
     *
     * It used to count `list.query` at exactly two. The login panel is a third
     * reader of the same key, and a number that changes when a component is added
     * elsewhere was measuring the wiring instead of the promise. The promise is
     * that the agent is on screen without a reload, which the line above checks.
     */
    expect(trpc.agentConfig.list.query).toHaveBeenCalled();
  });

  it("clears the form so the next one starts empty", async () => {
    trpc.agentConfig.create.mutate.mockResolvedValue(config({ id: "ac2" }));
    await panel();

    await userEvent.type(screen.getByLabelText("Nome"), "eco");
    await userEvent.type(screen.getByLabelText("Comando"), "sh");
    await userEvent.type(screen.getByLabelText("Versão do adaptador"), "0.40.0");
    await userEvent.click(screen.getByRole("button", { name: "adicionar" }));

    await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue(""));
  });
});

describe("the list", () => {
  it("shows the pinned version of each agent, and no transport chip", async () => {
    trpc.agentConfig.list.query.mockResolvedValue([
      config({
        id: "ac2",
        name: "claude-acp",
        command: "claude-agent-acp",
        adapterVersion: "0.40.0",
      }),
    ]);

    const box = await panel();

    // The pinned version is on screen: it is the answer to "which adapter is this",
    // and A12 made it data precisely so it could be read.
    expect(within(box).getByText(/claude-agent-acp @0\.40\.0/)).toBeInTheDocument();
    // With one transport the word would say nothing; `033` F1.1 took the choice away.
    expect(within(box).queryByText("conversa")).not.toBeInTheDocument();
    expect(within(box).queryByText("terminal")).not.toBeInTheDocument();
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
    const box = await panel();

    // Escopado no painel: a tela do workspace, atrás deste, tem o `remover
    // workspace` dela — e `/remover/` solto casava os dois.
    await userEvent.click(within(box).getByRole("button", { name: /remover/ }));
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
    const box = await panel();

    await userEvent.click(within(box).getByRole("button", { name: /remover/ }));
    await userEvent.click(screen.getByRole("button", { name: "confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ainda está em uso");
  });
});
