import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MainColumn } from "./MainColumn.js";
import { renderWithProviders } from "./test/render.js";

/**
 * O `Arrival` que "trabalhar nesta tarefa" entrega ao store — achado 8 da
 * revisão independente das fases 5 e 6: `send: false`/`send: true` eram
 * literais sem teste nenhum, e invertê-los nos dois produtores deixava a
 * suíte inteira do `web` (1 243 testes) verde. A primeira mutação dispara o
 * corpo da tarefa como turno sem ninguém ler — a regra "injeção invisível é
 * proibida" (`016`) quebrada sem nada avisar.
 *
 * `WorkspacePanel` é trocado por um duplo mínimo: o que importa aqui não é a
 * tela, é o `Arrival` exato que `MainColumn` monta a partir do `target` que
 * ela recebe de volta.
 */

const arrive = vi.fn();

vi.mock("./lib/navigation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/navigation.js")>();
  return { ...actual, arrive: (next: unknown) => arrive(next) };
});

vi.mock("./features/settings/index.js", () => ({
  SettingsPanel: () => null,
}));

vi.mock("./features/checkout/index.js", () => ({
  LocalPanel: () => null,
  WorktreePanel: () => null,
}));

vi.mock("./features/workspace/index.js", () => ({
  useInvalidateWorkspaces: () => async () => {},
  WorkspacePanel: ({
    onWorkOnTask,
  }: {
    onWorkOnTask?: (target: {
      projectId: string;
      worktreeId: string | null;
      sessionId: string;
      draft: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onWorkOnTask?.({
          projectId: "p1",
          worktreeId: "wt1",
          sessionId: "s1",
          draft: "corrige o bug do parser",
        })
      }
    >
      trabalhar nesta tarefa
    </button>
  ),
}));

describe("a chegada que MainColumn entrega para \"trabalhar nesta tarefa\"", () => {
  it("não manda sozinha — send: false, para a pessoa ler e enviar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainColumn workspaceId="w1" workspaceName="pessoal" />);

    await user.click(screen.getByRole("button", { name: "trabalhar nesta tarefa" }));

    // O objeto inteiro, não só um campo: inverter `send` para `true` faria o
    // corpo da tarefa disparar como turno sem ninguém ler, e este `toEqual`
    // reprova.
    expect(arrive).toHaveBeenCalledWith({
      sessionId: "s1",
      text: "corrige o bug do parser",
      send: false,
    });
  });
});
