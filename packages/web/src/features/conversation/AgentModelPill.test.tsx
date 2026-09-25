import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdapterCatalogView } from "@lumem/shared";

import { useAdapterCatalog } from "../agent/index.js";
import {
  CLAUDE_VIEW,
  CODEX_NO_LOGIN_VIEW,
  CODEX_VIEW,
} from "../../test/adapter-catalog-fixtures.js";
import type { AgentModelChoice } from "./agent-model.js";
import { AgentModelPill, useAgentModelChoice } from "./AgentModelPill.js";

vi.mock("../agent/index.js", () => ({ useAdapterCatalog: vi.fn() }));

/**
 * A pílula ligada ao catálogo de verdade (`033` T16). O hook de dado é mockado
 * (`032` Q5: teste de tela mocka o hook), e o pai é o que a aba rascunho e o
 * compositor de worktree vão ser — quem lê `choice` para mandar ao daemon.
 */
function Parent({ projectId = "p1" }: { projectId?: string | null }) {
  const { catalog, choice, choose } = useAgentModelChoice(projectId);
  return (
    <>
      <output data-testid="choice">{JSON.stringify(choice)}</output>
      <AgentModelPill catalog={catalog} value={choice} onChange={choose} onLogin={() => undefined} />
    </>
  );
}

function catalogIs(data: readonly AdapterCatalogView[] | undefined) {
  vi.mocked(useAdapterCatalog).mockReturnValue({ data } as never);
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
