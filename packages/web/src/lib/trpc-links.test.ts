import { describe, expect, it } from "vitest";

import { travelsAlone } from "./trpc.js";

describe("o que viaja fora do lote", () => {
  // Medido no app de verdade (034 T18): o `setup.probe` sobe o adaptador e leva
  // de 4 a 9 s, e no mesmo lote segurava `workspace.slots`, `agentAccount.list`
  // e as listas de sessão — a tela inteira esperava o adaptador.
  it("o probe, que sobe um adaptador, não segura as consultas rápidas", () => {
    expect(travelsAlone("setup.probe")).toBe(true);
  });

  it("o que espera uma pessoa ou sobe um processo também viaja sozinho", () => {
    for (const path of ["setup.authenticate", "setup.installAdapter", "session.createAgent", "session.continueIn", "worktree.start"]) {
      expect(travelsAlone(path)).toBe(true);
    }
  });

  it("consulta rápida continua no lote", () => {
    for (const path of ["workspace.slots", "agentAccount.list", "session.listByScope", "health"]) {
      expect(travelsAlone(path)).toBe(false);
    }
  });
});
