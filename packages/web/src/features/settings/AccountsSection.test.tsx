import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountsSection } from "./AccountsSection.js";
import { CLAUDE_VIEW } from "../../test/adapter-catalog-fixtures.js";
import { accountRow } from "../../test/agent-account-fixtures.js";
import { renderWithProviders } from "../../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * `/settings` → Agentes, com as contas (`034` T13).
 *
 * O que estes casos provam é que cada gesto chega ao daemon com a conta certa —
 * e as duas recusas que a tela faz antes dele: a conta sem diretório não se
 * apaga de vez, e apagar pede a contagem de conversas na frase e na chamada.
 */

const TRABALHO = { id: "acct_trabalho", label: "trabalho", bare: false, isDefault: false, identity: null };

function loginMethod() {
  return {
    id: "claude-ai-login",
    name: "Claude Subscription",
    description: "Use Claude subscription",
    type: "terminal",
    command: "/usr/bin/node",
    args: ["/opt/claude-agent-acp", "--cli", "auth", "login"],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  trpc.setup.agents.query.mockResolvedValue({ adapters: [] });
  trpc.adapterCatalog.list.query.mockResolvedValue([{ ...CLAUDE_VIEW, accountId: "acct_pessoal" }]);
  trpc.agentAccount.list.query.mockResolvedValue([accountRow()]);
  for (const gesture of ["connect", "disconnect", "purge", "setDefault", "setDefaults"] as const) {
    trpc.agentAccount[gesture].mutate.mockResolvedValue({});
  }
});

function render() {
  return renderWithProviders(<AccountsSection />);
}

async function accountGroup(label: string) {
  return screen.findByRole("group", { name: `conta ${label}` });
}

describe("uma conta", () => {
  it("é a linha do agente mais uma sub-linha, com identidade, estado e a marca de padrão", async () => {
    render();

    const pessoal = await accountGroup("pessoal");
    expect(within(pessoal).getByText("vini@exemplo.com · max")).toBeInTheDocument();
    expect(within(pessoal).getByText("conectada")).toBeInTheDocument();
    expect(within(pessoal).getByText("padrão", { selector: ".set__mark" })).toBeInTheDocument();
    // Já é a padrão, e é o login desta máquina: nada a tornar padrão, nada a apagar.
    expect(within(pessoal).queryByRole("button", { name: "tornar padrão" })).toBeNull();
    expect(within(pessoal).queryByRole("button", { name: "apagar de vez" })).toBeNull();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  it("desconectar manda a conta", async () => {
    const user = userEvent.setup();
    render();

    await user.click(within(await accountGroup("pessoal")).getByRole("button", { name: "desconectar" }));

    expect(trpc.agentAccount.disconnect.mutate).toHaveBeenCalledWith({ accountId: "acct_pessoal" });
  });
});

describe("duas contas", () => {
  it("tornar padrão manda a conta que não é a padrão", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow(),
      accountRow({ ...TRABALHO, identity: { email: "vini@empresa.com", plan: "team" } }),
    ]);
    render();

    const trabalho = await accountGroup("trabalho");
    await user.click(within(trabalho).getByRole("button", { name: "tornar padrão" }));

    expect(trpc.agentAccount.setDefault.mutate).toHaveBeenCalledWith({ accountId: "acct_trabalho" });
  });
});

describe("conta desconectada", () => {
  it("apagar de vez pede a contagem na frase, e manda a mesma contagem", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow(),
      accountRow({ ...TRABALHO, state: "disconnected", identity: { email: "x@y.z", plan: null }, sessionCount: 3 }),
    ]);
    render();

    const trabalho = await accountGroup("trabalho");
    expect(within(trabalho).getByText("desconectada")).toBeInTheDocument();
    expect(within(trabalho).getByRole("button", { name: "reconectar" })).toBeInTheDocument();
    await user.click(within(trabalho).getByRole("button", { name: "apagar de vez" }));

    // O primeiro clique só pergunta: nada chegou ao daemon ainda.
    expect(trpc.agentAccount.purge.mutate).not.toHaveBeenCalled();
    expect(within(trabalho).getByText("apaga a conta e as 3 conversas dela")).toBeInTheDocument();
    await user.click(within(trabalho).getByRole("button", { name: "apagar de vez" }));

    expect(trpc.agentAccount.purge.mutate).toHaveBeenCalledWith({ accountId: "acct_trabalho", sessionCount: 3 });
  });

  it("a conta sem diretório não oferece apagar de vez", async () => {
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow({ state: "disconnected", isDefault: false, bare: true }),
    ]);
    render();

    const pessoal = await accountGroup("pessoal");
    expect(within(pessoal).getByText("desconectada")).toBeInTheDocument();
    expect(within(pessoal).queryByRole("button", { name: "apagar de vez" })).toBeNull();
  });

  it("a recusa do daemon aparece na linha, com a frase dele", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow({ ...TRABALHO, state: "disconnected", identity: { email: "x@y.z", plan: null }, sessionCount: 1 }),
    ]);
    trpc.agentAccount.purge.mutate.mockRejectedValue(new Error("há uma conversa aberta nesta conta"));
    render();

    const trabalho = await accountGroup("trabalho");
    await user.click(within(trabalho).getByRole("button", { name: "apagar de vez" }));
    expect(within(trabalho).getByText("apaga a conta e as 1 conversa dela")).toBeInTheDocument();
    await user.click(within(trabalho).getByRole("button", { name: "apagar de vez" }));

    expect(await within(trabalho).findByRole("alert")).toHaveTextContent("há uma conversa aberta nesta conta");
  });
});

describe("conta sem login", () => {
  it("`entrar` abre o login da conta, e o método vai ao daemon com a conta", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([accountRow(), accountRow({ ...TRABALHO, state: "disconnected" })]);
    trpc.setup.probe.query.mockResolvedValue({ authRequired: true, authMethods: [loginMethod()] });
    trpc.setup.login.mutate.mockResolvedValue({ ptySessionId: "pty1", command: "node", args: [] });
    render();

    await user.click(within(await accountGroup("trabalho")).getByRole("button", { name: "entrar" }));

    const panel = await screen.findByRole("group", { name: "entrar em trabalho" });
    expect(trpc.setup.probe.query).toHaveBeenCalledWith({ adapterId: "claude", accountId: "acct_trabalho" });
    await user.click(await within(panel).findByRole("button", { name: /Claude Subscription/ }));

    expect(trpc.setup.login.mutate).toHaveBeenCalledWith({
      methodId: "claude-ai-login",
      adapterId: "claude",
      accountId: "acct_trabalho",
    });
  });

  it("uma conta conectada cujo adaptador pede login também diz `entrar`", async () => {
    trpc.adapterCatalog.list.query.mockResolvedValue([
      { ...CLAUDE_VIEW, accountId: "acct_pessoal", authRequired: true },
    ]);
    render();

    const pessoal = await accountGroup("pessoal");
    expect(await within(pessoal).findByRole("button", { name: "entrar" })).toBeInTheDocument();
    expect(within(pessoal).queryByText("conectada")).toBeNull();
  });
});

describe("o trio padrão", () => {
  it("escolher o modelo grava na conta, e o effort que o modelo novo não tem cai", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([accountRow({ defaultModel: "opus[1m]", defaultEffort: "high" })]);
    render();

    const modelo = await screen.findByRole("combobox", { name: "modelo padrão de pessoal" });
    expect(screen.getByRole("combobox", { name: "effort padrão de pessoal" })).toHaveValue("high");
    await user.selectOptions(modelo, "haiku");

    expect(trpc.agentAccount.setDefaults.mutate).toHaveBeenCalledWith({
      accountId: "acct_pessoal",
      model: "haiku",
      effort: null,
    });
    expect(await screen.findByText("salvo")).toBeInTheDocument();
  });

  it("o effort grava com o modelo que já está lá, e o modelo sem effort não mostra o seletor", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([accountRow({ defaultModel: "sonnet" })]);
    render();

    await user.selectOptions(await screen.findByRole("combobox", { name: "effort padrão de pessoal" }), "low");

    expect(trpc.agentAccount.setDefaults.mutate).toHaveBeenCalledWith({
      accountId: "acct_pessoal",
      model: "sonnet",
      effort: "low",
    });
  });

  it("haiku não tem effort, e a linha não inventa um", async () => {
    trpc.agentAccount.list.query.mockResolvedValue([accountRow({ defaultModel: "haiku" })]);
    render();

    await screen.findByRole("combobox", { name: "modelo padrão de pessoal" });
    expect(screen.queryByRole("combobox", { name: "effort padrão de pessoal" })).toBeNull();
  });

  it("o modelo que saiu da lista diz que está indisponível", async () => {
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow({ defaultModel: "claude-velho", defaultsUnavailable: true }),
    ]);
    render();

    expect(await screen.findByText("indisponível — o modelo padrão saiu da lista")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "modelo padrão de pessoal" })).toHaveValue("claude-velho");
  });
});

describe("conectar conta", () => {
  it("diz o que liga e o que não leva, e com uma conta já conectada, a linha dos termos", async () => {
    const user = userEvent.setup();
    render();

    const header = await screen.findByText("Claude Code");
    await user.click(screen.getAllByRole("button", { name: "＋ conectar conta" })[0]!);

    const panel = screen.getByRole("group", { name: "conectar conta do Claude Code" });
    expect(header).toBeInTheDocument();
    expect(within(panel).getByText("settings.json")).toBeInTheDocument();
    expect(within(panel).getByText(/servidores MCP do usuário/)).toBeInTheDocument();
    expect(
      within(panel).getByText("usar duas assinaturas para somar limite pode ferir os termos do provedor"),
    ).toBeInTheDocument();
  });

  it("sem conta nenhuma, a linha dos termos não aparece", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.list.query.mockResolvedValue([]);
    render();

    await screen.findByText("Claude Code");
    await waitFor(() => expect(trpc.agentAccount.list.query).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "＋ conectar conta" })[0]!);

    expect(screen.queryByText(/ferir os termos/)).toBeNull();
  });

  it("assinatura: o rótulo vai ao daemon, e o login da conta nova abre em seguida", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.connect.mutate.mockImplementation(async () => {
      trpc.agentAccount.list.query.mockResolvedValue([accountRow(), accountRow({ ...TRABALHO, state: "disconnected" })]);
      return { account: { id: "acct_trabalho" }, linked: [], copied: [], notInherited: [] };
    });
    trpc.setup.probe.query.mockResolvedValue({ authRequired: true, authMethods: [loginMethod()] });
    render();

    await screen.findByText("Claude Code");
    await user.click(screen.getAllByRole("button", { name: "＋ conectar conta" })[0]!);
    const panel = screen.getByRole("group", { name: "conectar conta do Claude Code" });
    expect(within(panel).getByRole("button", { name: "conectar" })).toBeDisabled();
    await user.type(within(panel).getByLabelText("nome da conta"), "trabalho");
    await user.click(within(panel).getByRole("button", { name: "conectar" }));

    expect(trpc.agentAccount.connect.mutate).toHaveBeenCalledWith({
      adapterId: "claude",
      label: "trabalho",
      kind: "subscription",
    });
    expect(await screen.findByRole("group", { name: "entrar em trabalho" })).toBeInTheDocument();
  });

  it("chave de API: sem a chave não conecta, e com ela a chave vai junto", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.connect.mutate.mockResolvedValue({
      account: { id: "acct_chave" },
      linked: [],
      copied: [],
      notInherited: [],
    });
    render();

    await screen.findByText("Claude Code");
    await user.click(screen.getAllByRole("button", { name: "＋ conectar conta" })[0]!);
    const panel = screen.getByRole("group", { name: "conectar conta do Claude Code" });
    await user.type(within(panel).getByLabelText("nome da conta"), "cobrança");
    await user.click(within(panel).getByRole("button", { name: "chave de API" }));
    expect(within(panel).getByRole("button", { name: "conectar" })).toBeDisabled();
    await user.type(within(panel).getByLabelText("chave de API"), "sk-teste");
    await user.click(within(panel).getByRole("button", { name: "conectar" }));

    expect(trpc.agentAccount.connect.mutate).toHaveBeenCalledWith({
      adapterId: "claude",
      label: "cobrança",
      kind: "api_key",
      apiKey: "sk-teste",
    });
  });

  it("o rótulo repetido volta com a frase do daemon", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.connect.mutate.mockRejectedValue(new Error('já existe uma conta chamada "pessoal" neste agente'));
    render();

    await screen.findByText("Claude Code");
    await user.click(screen.getAllByRole("button", { name: "＋ conectar conta" })[0]!);
    const panel = screen.getByRole("group", { name: "conectar conta do Claude Code" });
    await user.type(within(panel).getByLabelText("nome da conta"), "pessoal");
    await user.click(within(panel).getByRole("button", { name: "conectar" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent('já existe uma conta chamada "pessoal"');
  });
});
