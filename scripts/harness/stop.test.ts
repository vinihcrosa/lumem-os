import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { blockReason, isConveyorCheckout, planStop } from "./stop.js";

describe("o Stop cobra o gate antes de *pronto*", () => {
  it("cobra quando a árvore mudou desde o último verde", () => {
    expect(planStop({ cwd: "/Users/x/conductor/workspaces/lumem-os/richmond" }, false)).toEqual({ kind: "gate" });
  });

  it("insiste **uma vez**: a segunda parada do turno passa", () => {
    expect(planStop({ stop_hook_active: true }, false).kind).toBe("skip");
  });

  it("não cobra uma árvore já carimbada verde — o mesmo carimbo do pre-push", () => {
    expect(planStop({}, true).kind).toBe("skip");
  });

  it("não roda na esteira, onde o portão da 028 julga", () => {
    const conveyor = "/Users/x/.lumem/workspaces/lumem/lumem-os/worktrees/lum-51-algo";
    expect(isConveyorCheckout(conveyor)).toBe(true);
    expect(isConveyorCheckout("/Users/x/.lumem-dev/shared/workspaces/w/p/worktrees/t")).toBe(true);
    expect(planStop({ cwd: conveyor }, false).kind).toBe("skip");
  });

  it("uma worktree de pessoa não é da esteira", () => {
    expect(isConveyorCheckout("/Users/x/conductor/workspaces/lumem-os/richmond")).toBe(false);
    expect(isConveyorCheckout("/Users/x/.lumem/workspaces/lumem/lumem-os/repo")).toBe(false);
  });

  it("a frase do bloqueio diz o que falhou **e** que parar de novo é permitido", () => {
    const reason = blockReason("FAIL src/x.test.ts > o caso");
    expect(reason).toContain("FAIL src/x.test.ts");
    expect(reason).toMatch(/RED/);
    expect(reason).toMatch(/segunda parada/);
  });

  it("está ligado no Stop do projeto, pelo node, com timeout acima do pior gate medido", () => {
    const settings = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", ".claude", "settings.json"), "utf8")) as {
      hooks?: { Stop?: { hooks?: { command?: string; timeout?: number }[] }[] };
    };
    const hooks = (settings.hooks?.Stop ?? []).flatMap((entry) => entry.hooks ?? []);
    const stop = hooks.find((hook) => hook.command?.includes("scripts/harness/stop.ts"));
    expect(stop?.command).toMatch(/^node .*--experimental-strip-types/);
    expect(stop?.timeout ?? 0).toBeGreaterThanOrEqual(180);
  });
});
