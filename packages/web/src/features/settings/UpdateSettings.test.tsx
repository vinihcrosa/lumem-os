import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateSettings } from "./UpdateSettings.js";
import { renderWithProviders } from "../../test/render.js";
import { DEFAULT_DAEMON_SETTINGS, installTrpcDefaults, trpcMock as trpc } from "../../test/trpc-mock.js";

vi.mock("../../lib/trpc.js", async () => ({
  trpc: (await import("../../test/trpc-mock.js")).trpcMock,
}));

/**
 * As preferências de versão em `/settings` (`038`, Parte 2).
 *
 * O transporte é o `trpcMock` e os hooks são os de verdade: o que se prova é o que a
 * pessoa vê a partir do que o daemon disse, e o que o clique manda de volta.
 */

beforeEach(() => {
  vi.resetAllMocks();
  installTrpcDefaults();
});

const CHECK = "Procurar versão nova";

describe("o interruptor de procurar versão nova", () => {
  it("disables the check toggle forced off by the environment", async () => {
    trpc.system.settings.query.mockResolvedValue({ ...DEFAULT_DAEMON_SETTINGS, updateCheckForcedOff: true });
    renderWithProviders(<UpdateSettings />);

    const toggle = await screen.findByRole("checkbox", { name: CHECK });

    // Desligado à força: quem pôs `LUMEM_NO_UPDATE_CHECK=1` no ambiente não quer que
    // uma tela o desfaça — e a tela diz **por que** não deixa, em vez de só recusar.
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("desligado por LUMEM_NO_UPDATE_CHECK")).toBeInTheDocument();
  });

  it("shows the stored preference and writes the change", async () => {
    trpc.system.settings.query.mockResolvedValue(DEFAULT_DAEMON_SETTINGS);
    trpc.system.setSettings.mutate.mockResolvedValue({ ...DEFAULT_DAEMON_SETTINGS, updateCheck: false });
    const user = userEvent.setup();
    renderWithProviders(<UpdateSettings />);

    const toggle = await screen.findByRole("checkbox", { name: CHECK });
    expect(toggle).toBeEnabled();
    expect(toggle).toBeChecked();
    expect(screen.queryByText(/LUMEM_NO_UPDATE_CHECK/)).not.toBeInTheDocument();

    await user.click(toggle);

    // Só o campo que mudou vai, e a tela passa a mostrar o que o daemon **gravou**.
    expect(trpc.system.setSettings.mutate).toHaveBeenCalledWith({ updateCheck: false });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: CHECK })).not.toBeChecked());
    expect(screen.getByText("desligado")).toBeInTheDocument();
  });

  it("says when the daemon could not be asked", async () => {
    trpc.system.settings.query.mockRejectedValue(new Error("o daemon não respondeu"));
    renderWithProviders(<UpdateSettings />);

    expect(await screen.findByRole("alert")).toHaveTextContent("o daemon não respondeu");
    expect(screen.queryByRole("checkbox", { name: CHECK })).not.toBeInTheDocument();
  });
});
