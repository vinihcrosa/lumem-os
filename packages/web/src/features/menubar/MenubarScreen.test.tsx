import { LUMEM_VERSION } from "@lumem/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenubarScreen } from "./MenubarScreen.js";
import { RELOADED_FOR_KEY } from "../../hooks/useVersionReload.js";
import { renderWithProviders } from "../../test/render.js";
import {
  NO_RESOURCES,
  NO_UPDATE,
  NOTHING_LIVE,
  installTrpcDefaults,
  trpcMock as trpc,
} from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * O painel do ícone da barra (`038`, Parte 3), `/menubar`.
 *
 * O transporte é o `trpcMock`, e os hooks e a tela são os de verdade: o que se prova
 * é o que a **pessoa** lê a partir do que o daemon respondeu. O relógio entra por
 * prop, para "reseta em 2 h" não depender de quando a suíte rodou.
 */

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const nowSeconds = NOW / 1000;

const MB = 1024 * 1024;

const RESOURCES = {
  groups: {
    daemon: { cpuPercent: 1.5, rssBytes: 180 * MB },
    agents: { cpuPercent: 22.4, rssBytes: 900 * MB },
    terminals: { cpuPercent: null, rssBytes: 40 * MB },
  },
  top: [
    { label: "Claude · lumem-os/bandung", pid: 200, cpuPercent: 20.1, rssBytes: 512 * MB },
    { label: "node", pid: 100, cpuPercent: 1.5, rssBytes: 180 * MB },
  ],
  sampledAt: "2026-09-29T12:00:00.000Z",
};

const NEWER = {
  ...NO_UPDATE,
  current: "0.6.1",
  latest: "0.7.0",
  checkedAt: "2026-09-29T11:57:00.000Z",
  updateAvailable: true,
  supervised: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("o painel da barra", () => {
  it("headlines the highest quota", async () => {
    // Duas contas: o que manda na manchete é a mais perto do teto, com a janela dela
    // e o tempo até ela renovar (AC 46).
    trpc.agentAccount.rateLimits.query.mockResolvedValue([
      { accountId: "a", adapterId: "claude", kind: "five_hour", utilization: 0.42, resetsAt: nowSeconds + 60 },
      {
        accountId: "b",
        adapterId: "claude",
        kind: "seven_day",
        utilization: 0.87,
        resetsAt: nowSeconds + 2 * 3600 + 10 * 60,
      },
    ]);
    renderWithProviders(<MenubarScreen now={NOW} />);

    const headline = await screen.findByRole("region", { name: "Consumo" });
    await waitFor(() => expect(within(headline).getByText("87%")).toBeInTheDocument());
    expect(within(headline).getByText("seven_day")).toBeInTheDocument();
    expect(within(headline).getByText("reseta em 2 h")).toBeInTheDocument();
    // A outra conta não disputa a manchete.
    expect(within(headline).queryByText("42%")).not.toBeInTheDocument();
    // Com cota relatada, o custo do dia nem entra na conta.
    expect(within(headline).queryByText(/hoje/)).not.toBeInTheDocument();
  });

  it("headlines today's cost, or tokens without a cost", async () => {
    // Ninguém relatou cota: vale o dia (AC 47), da janela `1d` do `usage.total`.
    trpc.usage.total.query.mockResolvedValue({ tokens: 48_200, cost: 1.75, currency: "USD", turns: 12 });
    const first = renderWithProviders(<MenubarScreen now={NOW} />);

    const headline = await screen.findByRole("region", { name: "Consumo" });
    await waitFor(() => expect(within(headline).getByText("US$ 1,75")).toBeInTheDocument());
    expect(within(headline).getByText("hoje")).toBeInTheDocument();
    expect(trpc.usage.total.query).toHaveBeenCalledWith({ period: "1d" });
    first.unmount();

    // O agente não relata dinheiro (`cost` nulo): os tokens, e nunca "US$ 0,00".
    trpc.usage.total.query.mockResolvedValue({ tokens: 48_200, cost: null, currency: null, turns: 12 });
    renderWithProviders(<MenubarScreen now={NOW} />);

    const tokens = await screen.findByRole("region", { name: "Consumo" });
    await waitFor(() => expect(within(tokens).getByText("48,2k tokens")).toBeInTheDocument());
    expect(within(tokens).getByText("hoje")).toBeInTheDocument();
    expect(within(tokens).queryByText(/US\$/)).not.toBeInTheDocument();
  });

  it("lays out sessions, resources, version and actions", async () => {
    trpc.system.live.query.mockResolvedValue({
      turns: [
        { sessionId: "s1", label: "Claude · lumem-os/bandung", startedAt: "2026-09-29T11:55:00.000Z" },
        { sessionId: "s2", label: "Codex · api/login", startedAt: "2026-09-29T11:59:30.000Z" },
      ],
      openTerminals: 0,
    });
    trpc.system.resources.query.mockResolvedValue(RESOURCES);
    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    trpc.workspace.recent.query.mockResolvedValue([
      { id: "w1", name: "pessoal" },
      { id: "w2", name: "trabalho" },
      { id: "w3", name: "estudos" },
    ]);
    renderWithProviders(<MenubarScreen now={NOW} />);

    // Os blocos, nessa ordem: consumo, turnos, recursos, versão, ações (AC 48).
    // O nome da sessão aparece duas vezes: no turno e no `top` dos recursos.
    await waitFor(() => expect(screen.getAllByText("Claude · lumem-os/bandung")).toHaveLength(2));
    await screen.findByText("v0.6.1");
    await screen.findByRole("button", { name: "pessoal" });
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Consumo",
      "Turnos em voo",
      "Recursos",
      "Versão",
      "Ações",
    ]);

    const turns = screen.getByRole("region", { name: "Turnos em voo" });
    const [claude, codex] = within(turns).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(within(claude).getByText("Claude · lumem-os/bandung")).toBeInTheDocument();
    expect(within(claude).getByText("há 5 min")).toBeInTheDocument();
    expect(within(codex).getByText("Codex · api/login")).toBeInTheDocument();
    expect(within(codex).getByText("agora")).toBeInTheDocument();

    // Os três grupos e os maiores, com número.
    const resources = screen.getByRole("region", { name: "Recursos" });
    expect(within(resources).getByText("Daemon")).toBeInTheDocument();
    expect(within(resources).getByText("22,4%")).toBeInTheDocument();
    expect(within(resources).getByText("900 MB")).toBeInTheDocument();
    // Sem taxa ainda (primeira amostra): um traço, e não "0%".
    expect(within(resources).getByText("—")).toBeInTheDocument();
    expect(within(resources).getByText("Claude · lumem-os/bandung")).toBeInTheDocument();
    expect(within(resources).getByText("512 MB")).toBeInTheDocument();

    const version = screen.getByRole("region", { name: "Versão" });
    expect(within(version).getByText("v0.6.1")).toBeInTheDocument();
    expect(within(version).getByText("atualização disponível: v0.7.0")).toBeInTheDocument();

    const actions = screen.getByRole("region", { name: "Ações" });
    expect(within(actions).getByRole("link", { name: "Abrir o Lumem" })).toHaveAttribute("href", "/");
    expect(within(actions).getByRole("button", { name: "Atualizar" })).toBeEnabled();
    expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Atualizar",
      "pessoal",
      "trabalho",
      "estudos",
    ]);
  });

  it("says the version is up to date, and when it was checked", async () => {
    trpc.system.updateStatus.query.mockResolvedValue({
      ...NO_UPDATE,
      current: "0.7.0",
      latest: "0.7.0",
      checkedAt: "2026-09-29T11:57:00.000Z",
    });
    renderWithProviders(<MenubarScreen now={NOW} />);

    const version = await screen.findByRole("region", { name: "Versão" });
    await waitFor(() => expect(within(version).getByText("v0.7.0")).toBeInTheDocument());
    expect(within(version).getByText("em dia · verificado há 3 min")).toBeInTheDocument();
    // Sem versão nova o gesto de atualizar não tem o que fazer.
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeDisabled();
  });

  it("says when nothing is running", async () => {
    trpc.system.live.query.mockResolvedValue(NOTHING_LIVE);
    renderWithProviders(<MenubarScreen now={NOW} />);

    const turns = await screen.findByRole("region", { name: "Turnos em voo" });
    expect(await within(turns).findByText("nenhuma sessão rodando")).toBeInTheDocument();
    expect(within(turns).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("fails one block at a time", async () => {
    trpc.system.resources.query.mockRejectedValue(new Error("ps quebrou"));
    trpc.usage.total.query.mockResolvedValue({ tokens: 1_000, cost: 0.5, currency: "USD", turns: 2 });
    trpc.system.live.query.mockResolvedValue({
      turns: [{ sessionId: "s1", label: "Claude · lumem-os/bandung", startedAt: "2026-09-29T11:55:00.000Z" }],
      openTerminals: 0,
    });
    renderWithProviders(<MenubarScreen now={NOW} />);

    // Só o bloco de recursos cai, e diz qual foi.
    const resources = await screen.findByRole("region", { name: "Recursos" });
    expect(await within(resources).findByText("não consegui ler os recursos")).toBeInTheDocument();
    // A manchete e as sessões aparecem (AC 50).
    const headline = screen.getByRole("region", { name: "Consumo" });
    await waitFor(() => expect(within(headline).getByText("US$ 0,50")).toBeInTheDocument());
    expect(await screen.findByText("Claude · lumem-os/bandung")).toBeInTheDocument();
    // E nenhum outro bloco herdou a falha.
    expect(screen.getAllByText(/não consegui ler/)).toHaveLength(1);
  });

  it("warns which terminals an update closes", async () => {
    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    trpc.system.live.query.mockResolvedValue({ turns: [], openTerminals: 2 });
    renderWithProviders(<MenubarScreen now={NOW} />);

    expect(await screen.findByText("2 terminais abertos fecham ao atualizar")).toBeInTheDocument();
  });

  it("says nothing about terminals when there is no update, or no terminal", async () => {
    // Sem versão nova: não há o que fechar. Sem terminal: não há o que avisar.
    trpc.system.updateStatus.query.mockResolvedValue({ ...NEWER, latest: "0.6.1", updateAvailable: false });
    trpc.system.live.query.mockResolvedValue({ turns: [], openTerminals: 2 });
    const quiet = renderWithProviders(<MenubarScreen now={NOW} />);
    await screen.findByRole("region", { name: "Ações" });
    await waitFor(() => expect(trpc.system.live.query).toHaveBeenCalled());
    expect(screen.queryByText(/fecham ao atualizar/)).not.toBeInTheDocument();
    quiet.unmount();

    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    trpc.system.live.query.mockResolvedValue({ turns: [], openTerminals: 0 });
    renderWithProviders(<MenubarScreen now={NOW} />);
    await screen.findByRole("button", { name: "Atualizar" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled());
    expect(screen.queryByText(/fecham ao atualizar/)).not.toBeInTheDocument();
  });

  it("says the singular when one terminal closes", async () => {
    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    trpc.system.live.query.mockResolvedValue({ turns: [], openTerminals: 1 });
    renderWithProviders(<MenubarScreen now={NOW} />);

    expect(await screen.findByText("1 terminal aberto fecha ao atualizar")).toBeInTheDocument();
  });

  it("updates through system.update, and shows why it was refused", async () => {
    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    trpc.system.update.mutate.mockRejectedValue(
      new Error("não dá para atualizar agora: 1 turnos em voo e 0 scripts de projeto rodando"),
    );
    renderWithProviders(<MenubarScreen now={NOW} />);

    const button = await screen.findByRole("button", { name: "Atualizar" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("não dá para atualizar agora");
    expect(trpc.system.update.mutate).toHaveBeenCalledTimes(1);
  });

  it("does not offer the update button without a supervisor", async () => {
    trpc.system.updateStatus.query.mockResolvedValue({ ...NEWER, supervised: false });
    renderWithProviders(<MenubarScreen now={NOW} />);

    const button = await screen.findByRole("button", { name: "Atualizar" });
    // Sem supervisor a atualização é 412; o botão desabilitado diz por quê.
    await waitFor(() =>
      expect(button).toHaveAttribute("title", "precisa do Lumem rodando como serviço"),
    );
    expect(button).toBeDisabled();
  });

  it("opens a recent workspace in the main window", async () => {
    trpc.workspace.recent.query.mockResolvedValue([{ id: "w2", name: "trabalho" }]);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithProviders(<MenubarScreen now={NOW} />);

    await userEvent.click(await screen.findByRole("button", { name: "trabalho" }));

    // É o mesmo `localStorage` que o `useActiveWorkspace` lê: a janela principal
    // abre já no workspace escolhido.
    expect(window.localStorage.getItem("lumem.activeWorkspaceId")).toBe("w2");
    expect(open).toHaveBeenCalledWith("/", "_blank");
  });

  it("shows the resources block with the empty defaults", async () => {
    trpc.system.resources.query.mockResolvedValue(NO_RESOURCES);
    renderWithProviders(<MenubarScreen now={NOW} />);

    const resources = await screen.findByRole("region", { name: "Recursos" });
    await waitFor(() => expect(within(resources).getByText("Agentes")).toBeInTheDocument());
    expect(within(resources).getByText("Terminais")).toBeInTheDocument();
  });

  it("reloads once when the daemon changes version under an open panel", async () => {
    // AC 34, no painel: uma janela que ficou aberta durante uma atualização é o bundle
    // velho na memória, falando com um daemon novo. Sem isto ela só se conserta quando
    // alguém a fecha e abre — e o app esconde o painel, não o fecha.
    window.sessionStorage.removeItem(RELOADED_FOR_KEY);
    trpc.system.updateStatus.query.mockResolvedValue({ ...NO_UPDATE, current: "99.0.0" });
    const reload = vi.fn();

    const first = renderWithProviders(<MenubarScreen now={NOW} reload={reload} />);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    first.unmount();

    // Depois do recarregamento as versões ainda diferem (um cache): não é laço.
    renderWithProviders(<MenubarScreen now={NOW} reload={reload} />);
    await screen.findByRole("region", { name: "Consumo" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a panel that is already on the daemon's version", async () => {
    window.sessionStorage.removeItem(RELOADED_FOR_KEY);
    trpc.system.updateStatus.query.mockResolvedValue({ ...NO_UPDATE, current: LUMEM_VERSION });
    const reload = vi.fn();

    renderWithProviders(<MenubarScreen now={NOW} reload={reload} />);

    await screen.findByRole("region", { name: "Consumo" });
    await waitFor(() => expect(trpc.system.updateStatus.query).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
  });
});
