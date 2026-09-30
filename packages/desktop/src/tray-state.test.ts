import { describe, expect, it } from "vitest";

import { trayState, type Snapshot } from "./tray-state.js";

/**
 * A tabela de decisão do ícone (`038`, AC 60): a **primeira** linha que casa vence.
 * Um caso por linha, e os dois que mostram a precedência — o que a torna tabela em vez
 * de quatro `if` soltos.
 */

const RUNNING: Snapshot = {
  reachable: true,
  version: "0.6.1",
  protocolVersion: 1,
  attention: false,
  updateAvailable: false,
};

describe("o ícone da bandeja", () => {
  it("picks the icon by precedence", () => {
    // 1 — `health` sem resposta é `stopped`, mesmo com versão nova (e com atenção, e com
    // protocolo estranho: um daemon parado não pede nada a ninguém).
    const stopped: Snapshot = {
      ...RUNNING,
      reachable: false,
      updateAvailable: true,
      attention: true,
      protocolVersion: 2,
    };
    expect(trayState(stopped)).toBe("stopped");

    // 2 — `attention` vence a versão nova.
    expect(trayState({ ...RUNNING, attention: true, updateAvailable: true })).toBe("attention");

    // 3 — `protocolVersion` diferente de 1 também é `attention`: o app não entende o
    // daemon, e dizer *rodando* seria mentir.
    expect(trayState({ ...RUNNING, protocolVersion: 2 })).toBe("attention");
    expect(trayState({ ...RUNNING, protocolVersion: 2, updateAvailable: true })).toBe("attention");

    // 4 — só a versão nova.
    expect(trayState({ ...RUNNING, updateAvailable: true })).toBe("update");

    // 5 — nada.
    expect(trayState(RUNNING)).toBe("running");
  });
});
