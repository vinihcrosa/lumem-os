import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NumberSetting } from "./SettingsPanel.js";

describe("o campo de teto", () => {
  /*
   * Visto no `gate:full` com o daemon ocupado (`034` T18): o primeiro save só
   * limpava o rascunho quando o `onCommit` resolvia — depois de recarregar —, e
   * se a pessoa já tinha apagado o campo de novo, o rascunho novo ia embora. O
   * blur mandava o valor antigo em vez de `null`, e "apagar grava sem teto"
   * gravava 12.
   */
  it("uma edição feita enquanto o save anterior termina não é descartada", async () => {
    const user = userEvent.setup();
    let finishFirst: () => void = () => {};
    const onCommit = vi
      .fn<(next: number | null) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
      .mockResolvedValue(undefined);

    const { rerender } = render(
      <NumberSetting id="cap" value={null} nullable onCommit={onCommit} ariaLabel="teto por dia" />,
    );
    const field = screen.getByLabelText("teto por dia");

    await user.type(field, "12");
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith(12);

    // O servidor já gravou; a tela ainda não recebeu a leitura nova.
    rerender(<NumberSetting id="cap" value={12} nullable onCommit={onCommit} ariaLabel="teto por dia" />);
    await user.clear(field);
    finishFirst();
    await user.tab();

    expect(onCommit).toHaveBeenLastCalledWith(null);
  });
});
