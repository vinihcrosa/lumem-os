import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateBanner } from "./UpdateBanner.js";
import { renderWithProviders } from "../../test/render.js";
import { NO_UPDATE, installTrpcDefaults, trpcMock as trpc } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * O banner da topbar (`038`, Parte 2): *"tem versão nova"* e o gesto de atualizar.
 *
 * O transporte é o `trpcMock`, e os hooks são os de verdade — o que este arquivo
 * prova é o que a **pessoa** vê a partir do que o daemon respondeu.
 */

const NEWER = {
  ...NO_UPDATE,
  current: "0.6.1",
  latest: "0.7.0",
  checkedAt: "2026-09-29T12:00:00.000Z",
  updateAvailable: true,
  supervised: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
});

describe("o banner de atualização", () => {
  it("shows the version jump and the button", async () => {
    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    const { container } = renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText("v0.6.1 → v0.7.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
    // Supervisionado: o botão é o gesto, e o comando manual não aparece ao lado dele.
    expect(screen.queryByText("lumem upgrade")).not.toBeInTheDocument();

    // Sem versão nova, nada: nem um espaço reservado na topbar.
    trpc.system.updateStatus.query.mockResolvedValue({ ...NEWER, latest: "0.6.1", updateAvailable: false });
    const quiet = renderWithProviders(<UpdateBanner />);
    await waitFor(() => expect(trpc.system.updateStatus.query).toHaveBeenCalledTimes(2));
    expect(quiet.container).toBeEmptyDOMElement();
    expect(container).not.toBeEmptyDOMElement();
  });

  it("shows the command when not supervised", async () => {
    trpc.system.updateStatus.query.mockResolvedValue({ ...NEWER, supervised: false });
    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByText("v0.6.1 → v0.7.0")).toBeInTheDocument();
    // Sem supervisor, sair com 0 não faria ninguém subir a versão nova: o botão
    // sumiria de qualquer jeito com um 412, e mostrá-lo seria prometer o que falha.
    expect(screen.getByText("lumem upgrade")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atualizar" })).not.toBeInTheDocument();
  });

  it("asks the daemon to update once, and says it is updating", async () => {
    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    trpc.system.update.mutate.mockResolvedValue({ started: true });
    const user = userEvent.setup();
    renderWithProviders(<UpdateBanner />);

    await user.click(await screen.findByRole("button", { name: "Atualizar" }));

    expect(trpc.system.update.mutate).toHaveBeenCalledTimes(1);
    // O daemon vai sair e voltar: até lá o botão não pode ser clicado de novo.
    const busy = await screen.findByRole("button", { name: "Atualizando…" });
    expect(busy).toBeDisabled();
  });

  it("says why the daemon refused, in the daemon's own words", async () => {
    trpc.system.updateStatus.query.mockResolvedValue(NEWER);
    trpc.system.update.mutate.mockRejectedValue(
      new Error("não dá para atualizar agora: 2 turnos em voo e 1 scripts de projeto rodando"),
    );
    const user = userEvent.setup();
    renderWithProviders(<UpdateBanner />);

    await user.click(await screen.findByRole("button", { name: "Atualizar" }));

    // A frase do daemon, e não uma nossa: só ele sabe quantos são, e o botão volta.
    expect(await screen.findByRole("alert")).toHaveTextContent("2 turnos em voo e 1 scripts");
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
  });

  it("says why the last install failed", async () => {
    // O `lastError` do daemon: a instalação que falhou (o npm sem permissão) não
    // pode parecer que nada aconteceu.
    trpc.system.updateStatus.query.mockResolvedValue({ ...NEWER, lastError: "o npm saiu com 243" });
    renderWithProviders(<UpdateBanner />);

    expect(await screen.findByRole("alert")).toHaveTextContent("o npm saiu com 243");
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
  });
});
