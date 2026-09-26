import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdapterCatalogView } from "@lumem/shared";

import { useAdapterCatalog, useAgentAccounts, type AgentAccountView } from "../agent/index.js";
import {
  CLAUDE_VIEW,
  CODEX_NO_LOGIN_VIEW,
  CODEX_VIEW,
} from "../../test/adapter-catalog-fixtures.js";
import { accountView } from "../../test/agent-account-fixtures.js";
import type { AgentModelChoice } from "./agent-model.js";
import { AgentModelPill, useAgentModelChoice } from "./AgentModelPill.js";

vi.mock("../agent/index.js", () => ({ useAdapterCatalog: vi.fn(), useAgentAccounts: vi.fn() }));

/**
 * A pílula ligada ao catálogo de verdade (`033` T16). O hook de dado é mockado
 * (`032` Q5: teste de tela mocka o hook), e o pai é o que a aba rascunho e o
 * compositor de worktree vão ser — quem lê `choice` para mandar ao daemon.
 */
function Parent({ projectId = "p1" }: { projectId?: string | null }) {
  const { catalog, accounts, choice, choose } = useAgentModelChoice(projectId);
  return (
    <>
      <output data-testid="choice">{JSON.stringify(choice)}</output>
      <AgentModelPill
        catalog={catalog}
        accounts={accounts}
        value={choice}
        onChange={choose}
        onLogin={() => undefined}
      />
    </>
  );
}

function catalogIs(data: readonly AdapterCatalogView[] | undefined) {
  vi.mocked(useAdapterCatalog).mockReturnValue({ data } as never);
}

function accountsAre(data: readonly AgentAccountView[] | undefined) {
  vi.mocked(useAgentAccounts).mockReturnValue({ data } as never);
}

function choice(): AgentModelChoice {
  return JSON.parse(screen.getByTestId("choice").textContent ?? "null") as AgentModelChoice;
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /^agente e modelo:/ }));
  return screen.getByRole("menu", { name: "agente e modelo" });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Sem contas lidas: a pílula de antes da `034`, e a forma que os casos abaixo afirmam.
  accountsAre(undefined);
});

describe("useAgentModelChoice + AgentModelPill", () => {
  it("lê o catálogo do projeto pedido", () => {
    catalogIs([CLAUDE_VIEW, CODEX_VIEW]);

    render(<Parent projectId="p7" />);

    expect(useAdapterCatalog).toHaveBeenCalledWith("p7");
  });

  it("nasce no ACP padrão, no modelo que ele devolve como padrão (Q8)", () => {
    catalogIs([CLAUDE_VIEW, CODEX_VIEW]);

    render(<Parent />);

    // `config` vazio é o padrão do ACP: o daemon não aplica o que ninguém pediu.
    expect(choice()).toEqual({ adapterId: "claude", config: {} });
    // E a pílula mostra o `currentValue` do `session/new` — `opus[1m]` é o Opus.
    expect(screen.getByRole("button", { name: "agente e modelo: Claude Code · Opus" })).toBeTruthy();
  });

  it("escolher `gpt-5.5` no grupo Codex devolve o ACP e o modelo juntos", async () => {
    catalogIs([CLAUDE_VIEW, CODEX_VIEW]);
    render(<Parent />);

    const menu = await openMenu();
    const codex = within(menu).getByRole("group", { name: "Codex" });
    await userEvent.click(within(codex).getByRole("menuitemradio", { name: /^gpt-5\.5/ }));

    expect(choice()).toEqual({ adapterId: "codex", config: { model: "gpt-5.5" } });
    expect(screen.getByRole("button", { name: "agente e modelo: Codex · gpt-5.5" })).toBeTruthy();
  });

  it("o grupo sem login fica desabilitado, com o motivo e o caminho", async () => {
    catalogIs([CLAUDE_VIEW, CODEX_NO_LOGIN_VIEW]);
    render(<Parent />);

    const menu = await openMenu();
    const codex = within(menu).getByRole("group", { name: /^Codex/ });

    expect(within(codex).getByText("sem login")).toBeTruthy();
    expect(within(codex).queryAllByRole("menuitemradio")).toHaveLength(0);
    expect(within(codex).getByRole("button", { name: "entrar ↓" })).toBeTruthy();
    // O grupo do Claude, logado, continua escolhível.
    const claude = within(menu).getByRole("group", { name: "Claude Code" });
    expect(within(claude).getAllByRole("menuitemradio").length).toBeGreaterThan(0);
  });

  it("com o padrão sem login, nasce no primeiro ACP que pode ser escolhido", () => {
    catalogIs([{ ...CLAUDE_VIEW, authRequired: true, configOptions: [], optionsByModel: {} }, CODEX_VIEW]);

    render(<Parent />);

    expect(choice()).toEqual({ adapterId: "codex", config: {} });
  });

  it("a escolha inicial segue o catálogo que chega depois, até alguém escolher", async () => {
    catalogIs(undefined);
    const view = render(<Parent />);

    expect(choice()).toEqual({ adapterId: "claude", config: {} });
    expect(screen.getByRole("button", { name: "agente e modelo: claude · carregando modelos" })).toBeTruthy();

    // O catálogo chega com o Claude sem login: a escolha que ninguém fez muda com ele.
    catalogIs([{ ...CLAUDE_VIEW, authRequired: true, configOptions: [], optionsByModel: {} }, CODEX_VIEW]);
    view.rerender(<Parent />);
    expect(choice()).toEqual({ adapterId: "codex", config: {} });

    // Escolhido por alguém, fica — um `catalog.changed` não desfaz o gesto.
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: /^gpt-6-astra/ }));
    catalogIs([CLAUDE_VIEW, CODEX_VIEW]);
    view.rerender(<Parent />);
    expect(choice()).toEqual({ adapterId: "codex", config: { model: "gpt-6-astra" } });
  });
});

/*
 * A escolha de conta (`034` T14): só com duas ou mais do agente escolhido, com a
 * padrão marcada, e trocar de conta troca modelo e effort para os padrão dela
 * (Q1a) — e a lista de modelos para a que aquela conta viu.
 */
describe("contas", () => {
  const PESSOAL = accountView();
  const TRABALHO = accountView({
    id: "acct_trabalho",
    label: "trabalho",
    isDefault: false,
    bare: false,
    identity: { email: "vini@empresa.com", plan: "team" },
    defaultModel: "claude-fable-5-1[1m]",
    defaultEffort: "medium",
  });
  const CODEX_DEFAULT = accountView({ id: "acct_codex", adapterId: "codex", label: "chatgpt" });

  const PESSOAL_VIEW: AdapterCatalogView = { ...CLAUDE_VIEW, accountId: "acct_pessoal" };
  /** A conta do trabalho vê outra lista: sem o Haiku. */
  const TRABALHO_VIEW: AdapterCatalogView = {
    ...CLAUDE_VIEW,
    accountId: "acct_trabalho",
    configOptions: CLAUDE_VIEW.configOptions.map((option) =>
      option.id === "model"
        ? { ...option, choices: option.choices.filter((entry) => entry.value !== "haiku") }
        : option,
    ),
  };
  const CATALOG = [PESSOAL_VIEW, TRABALHO_VIEW, { ...CODEX_VIEW, accountId: "acct_codex" }];

  it("com uma conta, a pílula é a de hoje — nada de conta no botão nem no menu", async () => {
    catalogIs([PESSOAL_VIEW, CODEX_VIEW]);
    accountsAre([PESSOAL]);
    render(<Parent />);

    expect(screen.getByRole("button", { name: "agente e modelo: Claude Code · Opus" })).toBeTruthy();
    const menu = await openMenu();
    expect(within(menu).queryByRole("group", { name: /^conta/ })).toBeNull();
    expect(within(menu).queryByText("pessoal")).toBeNull();
    // Um grupo por agente, mesmo com uma leitura por conta no catálogo.
    expect(within(menu).getAllByRole("group").map((group) => group.getAttribute("aria-labelledby"))).toEqual([
      "agent-menu-claude",
      "agent-menu-codex",
    ]);
  });

  it("com duas, a padrão vem marcada, e só o rótulo aparece", async () => {
    catalogIs(CATALOG);
    accountsAre([PESSOAL, TRABALHO, CODEX_DEFAULT]);
    render(<Parent />);

    expect(choice()).toEqual({ adapterId: "claude", accountId: "acct_pessoal", config: {} });
    const menu = await openMenu();
    const contas = within(menu).getByRole("group", { name: "conta do Claude Code" });
    expect(within(contas).getByRole("menuitemradio", { name: "pessoal" })).toHaveAttribute("aria-checked", "true");
    expect(within(contas).getByRole("menuitemradio", { name: "trabalho" })).toHaveAttribute("aria-checked", "false");
    expect(within(menu).queryByText("vini@empresa.com")).toBeNull();
    // Duas leituras do Claude no catálogo (uma por conta), e um grupo só.
    expect(within(menu).getAllByRole("group", { name: "Claude Code" })).toHaveLength(1);
  });

  it("trocar de conta troca modelo, effort e a lista para os da conta nova", async () => {
    catalogIs(CATALOG);
    accountsAre([PESSOAL, TRABALHO, CODEX_DEFAULT]);
    render(<Parent />);

    let menu = await openMenu();
    await userEvent.click(
      within(within(menu).getByRole("group", { name: "conta do Claude Code" })).getByRole("menuitemradio", {
        name: "trabalho",
      }),
    );

    // `config` vazio: quem aplica o trio da conta é o daemon, e a pílula mostra o mesmo.
    expect(choice()).toEqual({ adapterId: "claude", accountId: "acct_trabalho", config: {} });
    expect(screen.getByRole("button", { name: "agente e modelo: Claude Code · trabalho · Fable 5.1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Effort: medium" })).toBeTruthy();
    menu = await openMenu();
    const claude = within(menu).getByRole("group", { name: "Claude Code" });
    expect(within(claude).queryByRole("menuitemradio", { name: /^haiku/ })).toBeNull();
    expect(within(claude).getByRole("menuitemradio", { name: /^claude-fable-5-1/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("escolher um modelo depois de trocar de conta mantém a conta", async () => {
    catalogIs(CATALOG);
    accountsAre([PESSOAL, TRABALHO, CODEX_DEFAULT]);
    render(<Parent />);

    let menu = await openMenu();
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "trabalho" }));
    menu = await openMenu();
    await userEvent.click(
      within(within(menu).getByRole("group", { name: "Claude Code" })).getByRole("menuitemradio", { name: /^sonnet/ }),
    );

    expect(choice()).toEqual({ adapterId: "claude", accountId: "acct_trabalho", config: { model: "sonnet" } });
  });

  it("escolher um modelo do Codex leva a conta padrão do Codex", async () => {
    catalogIs(CATALOG);
    accountsAre([PESSOAL, TRABALHO, CODEX_DEFAULT]);
    render(<Parent />);

    const menu = await openMenu();
    await userEvent.click(
      within(within(menu).getByRole("group", { name: "Codex" })).getByRole("menuitemradio", { name: /^gpt-5\.5/ }),
    );

    expect(choice()).toEqual({ adapterId: "codex", accountId: "acct_codex", config: { model: "gpt-5.5" } });
  });

  it("a conta desconectada não entra na escolha", async () => {
    catalogIs(CATALOG);
    accountsAre([PESSOAL, { ...TRABALHO, state: "disconnected" }, CODEX_DEFAULT]);
    render(<Parent />);

    const menu = await openMenu();
    expect(within(menu).queryByRole("group", { name: /^conta/ })).toBeNull();
    expect(screen.getByRole("button", { name: "agente e modelo: Claude Code · Opus" })).toBeTruthy();
  });

  /*
   * A conta que pede login era escolhível, e a conversa morria no primeiro
   * prompt. Ela aparece — é o que diz que ela existe —, mas desabilitada, com o
   * motivo no rótulo e o caminho no `title`.
   */
  it("a conta que ainda não entrou aparece desabilitada, com `· sem login`, e não se escolhe", async () => {
    catalogIs([PESSOAL_VIEW, CODEX_VIEW]);
    accountsAre([PESSOAL, { ...TRABALHO, state: "disconnected", identity: null }]);
    render(<Parent />);

    const menu = await openMenu();
    const chip = within(menu).getByRole("menuitemradio", { name: "trabalho · sem login" });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute("title", "entre em Configurações → Agentes");
    await userEvent.click(chip);

    expect(choice()).toEqual({ adapterId: "claude", accountId: "acct_pessoal", config: {} });
  });

  it("a conta conectada cujo adaptador pede login também fica desabilitada", async () => {
    catalogIs([PESSOAL_VIEW, { ...CLAUDE_VIEW, accountId: TRABALHO.id, authRequired: true }, CODEX_VIEW]);
    accountsAre([PESSOAL, TRABALHO]);
    render(<Parent />);

    const menu = await openMenu();
    expect(within(menu).getByRole("menuitemradio", { name: "trabalho · sem login" })).toBeDisabled();
    expect(within(menu).getByRole("menuitemradio", { name: "pessoal" })).toBeEnabled();
  });
});
