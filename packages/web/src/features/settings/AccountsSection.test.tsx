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
  for (const gesture of ["connect", "disconnect", "purge", "setDefault", "setDefaults", "rename"] as const) {
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

describe("renomear", () => {
  /*
   * O nome é seu (Q2) — inclusive o da conta que já existia, que nasce
   * `principal`. Clicar no nome vira campo; `Enter` grava, `Esc` desiste.
   */
  it("clicar no nome vira campo, e Enter manda o nome novo, aparado", async () => {
    const user = userEvent.setup();
    render();

    const pessoal = await accountGroup("pessoal");
    await user.click(within(pessoal).getByRole("button", { name: "renomear pessoal" }));
    const field = within(pessoal).getByRole("textbox", { name: "nome da conta pessoal" });
    expect(field).toHaveValue("pessoal");
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, "  casa  {Enter}");

    expect(trpc.agentAccount.rename.mutate).toHaveBeenCalledWith({ accountId: "acct_pessoal", label: "casa" });
    await waitFor(() => expect(within(pessoal).queryByRole("textbox")).toBeNull());
  });

  it("Esc desiste sem mandar nada", async () => {
    const user = userEvent.setup();
    render();

    const pessoal = await accountGroup("pessoal");
    await user.click(within(pessoal).getByRole("button", { name: "renomear pessoal" }));
    await user.type(within(pessoal).getByRole("textbox", { name: "nome da conta pessoal" }), "xyz{Escape}");

    expect(within(pessoal).queryByRole("textbox")).toBeNull();
    expect(within(pessoal).getByRole("button", { name: "renomear pessoal" })).toHaveTextContent("pessoal");
    expect(trpc.agentAccount.rename.mutate).not.toHaveBeenCalled();
  });

  it("vazio ou igual não vai ao daemon", async () => {
    const user = userEvent.setup();
    render();

    const pessoal = await accountGroup("pessoal");
    await user.click(within(pessoal).getByRole("button", { name: "renomear pessoal" }));
    await user.keyboard("{Enter}");
    await user.click(within(pessoal).getByRole("button", { name: "renomear pessoal" }));
    await user.clear(within(pessoal).getByRole("textbox", { name: "nome da conta pessoal" }));
    await user.keyboard("   {Enter}");

    expect(trpc.agentAccount.rename.mutate).not.toHaveBeenCalled();
  });

  it("a recusa do daemon aparece na linha, e o campo fica para corrigir", async () => {
    const user = userEvent.setup();
    trpc.agentAccount.rename.mutate.mockRejectedValue(new Error('já existe uma conta chamada "trabalho" neste agente'));
    render();

    const pessoal = await accountGroup("pessoal");
    await user.click(within(pessoal).getByRole("button", { name: "renomear pessoal" }));
    const field = within(pessoal).getByRole("textbox", { name: "nome da conta pessoal" });
    await user.clear(field);
    await user.type(field, "trabalho{Enter}");

    expect(await within(pessoal).findByRole("alert")).toHaveTextContent('já existe uma conta chamada "trabalho"');
    expect(within(pessoal).getByRole("textbox", { name: "nome da conta pessoal" })).toHaveValue("trabalho");
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

/*
 * `● ENTRAR` tinha a mesma cara de `● CONECTADA`, e ninguém adivinhava que era
 * clicável. O estado é estado (`sem login`), e o gesto é um botão como os
 * outros da linha.
 */
describe("a conta que pede login", () => {
  it("o estado diz `sem login`, e `entrar` é um botão igual a `desconectar`", async () => {
    trpc.adapterCatalog.list.query.mockResolvedValue([
      { ...CLAUDE_VIEW, accountId: "acct_pessoal", authRequired: true },
    ]);
    render();

    const pessoal = await accountGroup("pessoal");
    expect(await within(pessoal).findByText("sem login")).toHaveClass("set__st");
    const entrar = within(pessoal).getByRole("button", { name: "entrar" });
    const desconectar = within(pessoal).getByRole("button", { name: "desconectar" });
    expect(entrar.className).toBe(desconectar.className);
  });

  it("não mostra o trio: a lista antes do login é genérica, e é ruído", async () => {
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow(),
      accountRow({ ...TRABALHO, state: "disconnected" }),
    ]);
    render();

    const trabalho = await accountGroup("trabalho");
    expect(within(trabalho).getByText("sem login")).toBeInTheDocument();
    expect(within(trabalho).queryByRole("combobox")).toBeNull();
    expect(within(trabalho).queryByText("conversa nova")).toBeNull();
    // A conectada ao lado continua com o dela.
    expect(await within(await accountGroup("pessoal")).findByRole("combobox", { name: "modelo padrão de pessoal" })).toBeInTheDocument();
  });

  it("a desconectada também não mostra o trio", async () => {
    trpc.agentAccount.list.query.mockResolvedValue([
      accountRow(),
      accountRow({ ...TRABALHO, state: "disconnected", identity: { email: "x@y.z", plan: null } }),
    ]);
    render();

    const trabalho = await accountGroup("trabalho");
    expect(within(trabalho).getByText("desconectada")).toBeInTheDocument();
    expect(within(trabalho).queryByText("conversa nova")).toBeNull();
  });
});

describe("o trio padrão", () => {
  it("cada seletor tem legenda, e herdar diz de quem é o padrão", async () => {
    trpc.agentAccount.list.query.mockResolvedValue([accountRow({ defaultModel: "sonnet" })]);
    render();

    const modelo = await screen.findByRole("combobox", { name: "modelo padrão de pessoal" });
    const effort = screen.getByRole("combobox", { name: "effort padrão de pessoal" });
    // A legenda é o irmão logo antes, à vista — não só o `aria-label`.
    expect(modelo.previousElementSibling).toHaveTextContent(/^modelo$/);
    expect(effort.previousElementSibling).toHaveTextContent(/^effort$/);
    expect(within(modelo).getByRole("option", { name: "padrão do adaptador" })).toHaveValue("");
    expect(within(effort).getByRole("option", { name: "padrão do modelo" })).toHaveValue("");
  });

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

/*
 * O agente sem conta nenhuma (Codex nunca conectado nesta máquina). O `＋
 * conectar conta` criava a `principal` **e** uma conta nova de diretório vazio,
 * que pedia login do zero — o `~/.codex` que já estava logado ficava de lado. O
 * gesto é outro: adotar o login da máquina, pelo mesmo caminho do rodapé.
 */
describe("agente sem conta", () => {
  it("diz que o login da máquina entra como principal, e não oferece `＋ conectar conta`", async () => {
    render();

    const codex = await screen.findByRole("group", { name: "nenhuma conta do Codex" });
    expect(
      within(codex).getByText("nenhuma conta ainda — o login que já existe nesta máquina entra como principal"),
    ).toBeInTheDocument();
    expect(within(codex).getByRole("button", { name: "conectar Codex" })).toBeInTheDocument();
    // O Claude tem conta: o `＋` dele fica; o do Codex, não.
    expect(await screen.findAllByRole("button", { name: "＋ conectar conta" })).toHaveLength(1);
  });

  it("conectar instala se precisar, cria a configuração e confere a conta padrão dela", async () => {
    const user = userEvent.setup();
    trpc.setup.installAdapter.mutate.mockResolvedValue({ path: "/state/adapters/codex/bin" });
    trpc.setup.probe.query.mockResolvedValue({ agentInfo: { version: "1.10.0" }, authRequired: false, authMethods: [] });
    trpc.agentConfig.create.mutate.mockResolvedValue({ id: "cfg_codex" });
    render();

    const codex = await screen.findByRole("group", { name: "nenhuma conta do Codex" });
    const calls = trpc.agentAccount.list.query.mock.calls.length;
    await user.click(within(codex).getByRole("button", { name: "conectar Codex" }));

    await waitFor(() => expect(trpc.setup.probe.query).toHaveBeenLastCalledWith({ adapterId: "codex" }));
    expect(trpc.setup.installAdapter.mutate).toHaveBeenCalledWith({ adapterId: "codex" });
    expect(trpc.agentConfig.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "codex", command: "/state/adapters/codex/bin" }),
    );
    // A conta que a configuração criou só aparece se a lista for relida.
    await waitFor(() => expect(trpc.agentAccount.list.query.mock.calls.length).toBeGreaterThan(calls));
  });

  it("a recusa aparece na linha, com a frase do daemon", async () => {
    const user = userEvent.setup();
    trpc.setup.installAdapter.mutate.mockRejectedValue(new Error("npm não respondeu"));
    render();

    const codex = await screen.findByRole("group", { name: "nenhuma conta do Codex" });
    await user.click(within(codex).getByRole("button", { name: "conectar Codex" }));

    expect(await within(codex).findByRole("alert")).toHaveTextContent("npm não respondeu");
  });
});

describe("conectar conta", () => {
  it("diz o que liga e o que não leva, e com uma conta já conectada, a linha dos termos", async () => {
    const user = userEvent.setup();
    render();

    const header = await screen.findByText("Claude Code");
    await user.click((await screen.findAllByRole("button", { name: "＋ conectar conta" }))[0]!);

    const panel = screen.getByRole("group", { name: "conectar conta do Claude Code" });
    expect(header).toBeInTheDocument();
    expect(within(panel).getByText("settings.json")).toBeInTheDocument();
    expect(within(panel).getByText(/servidores MCP do usuário/)).toBeInTheDocument();
    expect(
      within(panel).getByText("usar duas assinaturas para somar limite pode ferir os termos do provedor"),
    ).toBeInTheDocument();
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
    await user.click((await screen.findAllByRole("button", { name: "＋ conectar conta" }))[0]!);
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
    await user.click((await screen.findAllByRole("button", { name: "＋ conectar conta" }))[0]!);
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
    await user.click((await screen.findAllByRole("button", { name: "＋ conectar conta" }))[0]!);
    const panel = screen.getByRole("group", { name: "conectar conta do Claude Code" });
    await user.type(within(panel).getByLabelText("nome da conta"), "pessoal");
    await user.click(within(panel).getByRole("button", { name: "conectar" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent('já existe uma conta chamada "pessoal"');
  });
});
