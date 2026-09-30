import { describe, expect, it, vi } from "vitest";

import { buildMenu, type MenuActions } from "./menu.js";
import type { Snapshot } from "./tray-state.js";

const RUNNING: Snapshot = {
  reachable: true,
  version: "0.6.1",
  protocolVersion: 1,
  attention: false,
  updateAvailable: false,
};

const STOPPED: Snapshot = {
  reachable: false,
  version: null,
  protocolVersion: null,
  attention: false,
  updateAvailable: false,
};

function actions(): MenuActions {
  return {
    openPanel: vi.fn(),
    openMain: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    update: vi.fn(),
    quit: vi.fn(),
  };
}

describe("o menu de contexto", () => {
  it("builds the context menu in order", () => {
    // Rodando e em dia: os seis itens, na ordem do AC 62, `Parar` no lugar de `Iniciar`,
    // e `Atualizar` desligado.
    const running = buildMenu(RUNNING, actions());
    expect(running.map((item) => item.label)).toEqual([
      "Abrir painel",
      "rodando · v0.6.1",
      "Abrir o Lumem",
      "Parar",
      "Atualizar",
      "Sair",
    ]);
    expect(running.map((item) => item.enabled ?? true)).toEqual([true, false, true, true, false, true]);

    // Com versão nova a linha de estado a diz, e `Atualizar` liga.
    const newer = buildMenu({ ...RUNNING, updateAvailable: true }, actions());
    expect(newer[1]?.label).toBe("rodando · v0.6.1 · atualização disponível");
    expect(newer[4]).toMatchObject({ label: "Atualizar", enabled: true });

    // Parado: `Iniciar`, e a linha não inventa uma versão que ninguém respondeu.
    const stopped = buildMenu(STOPPED, actions());
    expect(stopped.map((item) => item.label)).toEqual([
      "Abrir painel",
      "parado",
      "Abrir o Lumem",
      "Iniciar",
      "Atualizar",
      "Sair",
    ]);
    expect(stopped[4]?.enabled).toBe(false);

    // Precisa de atenção: o estado muda e a versão fica.
    expect(buildMenu({ ...RUNNING, attention: true }, actions())[1]?.label).toBe(
      "precisa de atenção · v0.6.1",
    );
  });

  it("wires each item to its action", () => {
    const wired = actions();
    const running = buildMenu({ ...RUNNING, updateAvailable: true }, wired);

    for (const index of [0, 2, 3, 4, 5]) running[index]?.click?.();
    expect(wired.openPanel).toHaveBeenCalledTimes(1);
    expect(wired.openMain).toHaveBeenCalledTimes(1);
    expect(wired.stop).toHaveBeenCalledTimes(1);
    expect(wired.update).toHaveBeenCalledTimes(1);
    expect(wired.quit).toHaveBeenCalledTimes(1);
    expect(wired.start).not.toHaveBeenCalled();
    // A linha de estado é só texto.
    expect(running[1]?.click).toBeUndefined();

    buildMenu(STOPPED, wired)[3]?.click?.();
    expect(wired.start).toHaveBeenCalledTimes(1);
  });

  it("says when app and daemon speak different protocols", () => {
    // O app só entende a versão 1; a linha diz o que fazer, e é a **única** coisa que
    // muda — o resto do menu segue o estado.
    const incompatible = buildMenu({ ...RUNNING, protocolVersion: 2 }, actions());

    expect(incompatible[1]?.label).toBe("app e Lumem em versões incompatíveis — rode lumem menubar install");
    expect(incompatible[1]?.enabled).toBe(false);
    expect(incompatible[3]?.label).toBe("Parar");
  });
});
