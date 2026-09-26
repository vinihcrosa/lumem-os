import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConveyorSlots } from "./ConveyorSlots.js";
import { CLAUDE_VIEW, CODEX_VIEW } from "../../test/adapter-catalog-fixtures.js";
import { accountRow } from "../../test/agent-account-fixtures.js";
import { renderWithProviders } from "../../test/render.js";
import { installTrpcDefaults, trpcMock as trpc } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * Os encaixes da esteira em `/settings` (`034` T16, Q5): o trio que cada um
 * resolve no workspace, e trocar só um deles.
 */

const CODEX_TRABALHO = accountRow({
  id: "acct_codex",
  adapterId: "codex",
  label: "trabalho",
  isDefault: true,
  bare: false,
  defaultModel: "gpt-5.5",
});

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  trpc.agentAccount.list.query.mockResolvedValue([
    accountRow({ defaultModel: "opus[1m]", defaultEffort: "xhigh" }),
    CODEX_TRABALHO,
  ]);
  trpc.adapterCatalog.list.query.mockResolvedValue([
    { ...CLAUDE_VIEW, accountId: "acct_pessoal" },
    { ...CODEX_VIEW, accountId: "acct_codex" },
  ]);
  trpc.workspace.setSlot.mutate.mockResolvedValue({ ok: true });
});

function render() {
  return renderWithProviders(<ConveyorSlots workspaceId="w1" />);
}

async function slot(role: string) {
  return screen.findByRole("group", { name: `encaixe ${role}` });
}

describe("o trio de cada encaixe", () => {
  it("sem nada configurado, diz o default e o que ele herda da conta padrão", async () => {
    render();

    const revisor = await slot("revisor");
    // Uma linha: de onde vem e a conta. Agente, modelo e effort já estão nos seletores.
    expect(await within(revisor).findByText("padrão do produto · pessoal")).toBeInTheDocument();
    expect(within(revisor).getByRole("combobox", { name: "conta do revisor" })).toHaveValue("claude:");
  });

  it("a opção de herdar diz `conta padrão`, e não `a padrão` solto", async () => {
    render();

    const revisor = await slot("revisor");
    const conta = await within(revisor).findByRole("combobox", { name: "conta do revisor" });
    const herdar = within(conta).getByRole("option", { name: "Claude Code · conta padrão" });
    expect(herdar).toHaveValue("claude:");
    expect(within(conta).queryByRole("option", { name: /· a padrão$/ })).toBeNull();
  });

  it("configurado no workspace, diz de onde veio e o trio dele", async () => {
    trpc.workspace.slots.query.mockResolvedValue([
      { role: "implementador", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
      { role: "revisor", from: "workspace", adapter: "codex", accountId: "acct_codex", accountLabel: "trabalho", model: null, effort: null },
      { role: "testador", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
    ]);
    render();

    const revisor = await slot("revisor");
    expect(await within(revisor).findByText("deste workspace · trabalho")).toBeInTheDocument();
    expect(within(revisor).getByRole("combobox", { name: "conta do revisor" })).toHaveValue("codex:acct_codex");
  });
});

describe("o grupo", () => {
  it("os três encaixes vêm debaixo de `Quem faz cada papel`, separados do orçamento", async () => {
    render();

    const group = await screen.findByRole("group", { name: "Quem faz cada papel" });
    expect(within(group).getByRole("heading", { name: "Quem faz cada papel", level: 3 })).toBeInTheDocument();
    for (const role of ["implementador", "revisor", "testador"]) {
      expect(await within(group).findByRole("group", { name: `encaixe ${role}` })).toBeInTheDocument();
    }
  });
});

describe("as legendas", () => {
  it("modelo e effort têm legenda à vista, e herdar diz `padrão da conta`", async () => {
    trpc.workspace.slots.query.mockResolvedValue([
      { role: "implementador", from: "workspace", adapter: "claude", accountId: "acct_pessoal", accountLabel: "pessoal", model: "sonnet", effort: null },
      { role: "revisor", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
      { role: "testador", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
    ]);
    render();

    const implementador = await slot("implementador");
    const modelo = await within(implementador).findByRole("combobox", { name: "modelo do implementador" });
    const effort = within(implementador).getByRole("combobox", { name: "effort do implementador" });
    expect(modelo.previousElementSibling).toHaveTextContent(/^modelo$/);
    expect(effort.previousElementSibling).toHaveTextContent(/^effort$/);
    expect(within(modelo).getByRole("option", { name: "padrão da conta" })).toHaveValue("");
    expect(within(effort).getByRole("option", { name: "padrão da conta" })).toHaveValue("");
  });
});

describe("trocar um encaixe", () => {
  it("trocar a conta grava só aquele encaixe, e modelo e effort voltam a herdar da conta nova", async () => {
    const user = userEvent.setup();
    render();

    const revisor = await slot("revisor");
    await user.selectOptions(await within(revisor).findByRole("combobox", { name: "conta do revisor" }), "codex:acct_codex");

    expect(trpc.workspace.setSlot.mutate).toHaveBeenCalledExactlyOnceWith({
      id: "w1",
      role: "revisor",
      adapter: "codex",
      accountId: "acct_codex",
      model: null,
      effort: null,
    });
  });

  it("escolher o modelo mantém a conta, e o effort que o modelo não tem cai", async () => {
    const user = userEvent.setup();
    trpc.workspace.slots.query.mockResolvedValue([
      { role: "implementador", from: "workspace", adapter: "claude", accountId: "acct_pessoal", accountLabel: "pessoal", model: "opus[1m]", effort: "high" },
      { role: "revisor", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
      { role: "testador", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
    ]);
    render();

    const implementador = await slot("implementador");
    expect(await within(implementador).findByRole("combobox", { name: "effort do implementador" })).toHaveValue("high");
    await user.selectOptions(within(implementador).getByRole("combobox", { name: "modelo do implementador" }), "haiku");

    expect(trpc.workspace.setSlot.mutate).toHaveBeenCalledWith({
      id: "w1",
      role: "implementador",
      adapter: "claude",
      accountId: "acct_pessoal",
      model: "haiku",
      effort: null,
    });
  });

  it("o modelo sem effort não mostra o seletor de effort", async () => {
    trpc.workspace.slots.query.mockResolvedValue([
      { role: "implementador", from: "workspace", adapter: "claude", accountId: "acct_pessoal", accountLabel: "pessoal", model: "haiku", effort: null },
      { role: "revisor", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
      { role: "testador", from: "default", adapter: "claude", accountId: null, accountLabel: null, model: null, effort: null },
    ]);
    render();

    const implementador = await slot("implementador");
    await within(implementador).findByRole("combobox", { name: "modelo do implementador" });
    expect(within(implementador).queryByRole("combobox", { name: "effort do implementador" })).toBeNull();
  });
});
