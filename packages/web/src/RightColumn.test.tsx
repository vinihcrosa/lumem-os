import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RightColumn } from "./RightColumn.js";
import { select } from "./lib/navigation.js";
import { renderWithProviders } from "./test/render.js";

/**
 * O `Arrival` que "pedir para o agente criar" entrega ao store — irmão do
 * `MainColumn.test.tsx`, achado 8 da revisão independente. Aqui o literal é
 * `send: true`: o único propósito do botão do rodapé é mandar sozinho, e
 * invertê-lo esvaziaria esse propósito sem nada falhar.
 *
 * `CheckoutFiles` é trocado por um duplo mínimo: o que importa é o `Arrival`
 * exato que `RightColumn` monta a partir do `onAskAgent(sessionId, text)`.
 */

const arrive = vi.fn();

vi.mock("./lib/navigation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/navigation.js")>();
  return { ...actual, arrive: (next: unknown) => arrive(next) };
});

vi.mock("./features/checkout/index.js", () => ({
  CheckoutFiles: ({
    onAskAgent,
  }: {
    onAskAgent: (sessionId: string, text: string) => void;
  }) => (
    <button type="button" onClick={() => onAskAgent("s1", "crie o endpoint de exportação")}>
      pedir para o agente criar
    </button>
  ),
  useRightPanel: () => ({ open: true, width: 360, toggle: () => {}, setWidth: () => {} }),
  useRunDock: () => ({
    open: false,
    height: 200,
    toggle: () => {},
    setHeight: () => {},
    startDrag: () => {},
  }),
  widenColumnOnOpen: (dock: unknown) => dock,
}));

describe("a chegada que RightColumn entrega para \"pedir para o agente criar\"", () => {
  it("manda sozinha — send: true, sem esperar ninguém ler", async () => {
    const user = userEvent.setup();
    select({ projectId: "p1", scope: { scopeType: "worktree", scopeId: "wt1" } });
    renderWithProviders(<RightColumn />);

    await user.click(screen.getByRole("button", { name: "pedir para o agente criar" }));

    // O objeto inteiro: inverter `send` para `false` esvaziaria o único
    // propósito do botão, e este `toEqual` reprova.
    expect(arrive).toHaveBeenCalledWith({
      sessionId: "s1",
      text: "crie o endpoint de exportação",
      send: true,
    });
  });
});
