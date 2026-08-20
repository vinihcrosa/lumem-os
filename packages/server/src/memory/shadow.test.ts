import { describe, expect, it } from "vitest";

import type { MemoryEntryRow } from "../db/schema.js";

import { resolveVisible } from "./shadow.js";

function row(overrides: Partial<MemoryEntryRow> = {}): MemoryEntryRow {
  return {
    id: overrides.path ?? "id",
    path: "memory/user_x.md",
    type: "user",
    scope: "global",
    slug: "estilo",
    workspaceId: null,
    projectId: null,
    name: "Estilo",
    description: "d",
    sourceActor: "human",
    confidence: "medium",
    contentHash: "h",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  } as MemoryEntryRow;
}

describe("shadow por identidade", () => {
  it("projeto sombreia workspace, que sombreia global", () => {
    const rows = [
      row({ path: "a", scope: "global" }),
      row({ path: "b", scope: "workspace", workspaceId: "ws1" }),
      row({ path: "c", scope: "project", workspaceId: "ws1", projectId: "p1" }),
    ];

    const { visible, shadowed } = resolveVisible(rows, { workspaceId: "ws1", projectId: "p1" });

    expect(visible).toHaveLength(1);
    expect(visible[0]?.path).toBe("c");
    // Nada é concatenado: o perdedor fica no disco e o sombreamento é evento.
    expect(shadowed).toHaveLength(2);
    expect(shadowed.every((pair) => pair.winner.path === "c")).toBe(true);
  });

  it("sem projeto ativo, quem ganha é o workspace", () => {
    const rows = [
      row({ path: "a", scope: "global" }),
      row({ path: "b", scope: "workspace", workspaceId: "ws1" }),
      row({ path: "c", scope: "project", workspaceId: "ws1", projectId: "p1" }),
    ];

    const { visible, shadowed } = resolveVisible(rows, { workspaceId: "ws1" });

    // A memória do projeto nem entra em cena: ela não pertence ao escopo ativo.
    // E, entre as duas que entram, a de workspace é a mais específica.
    expect(visible.map((entry) => entry.path)).toEqual(["b"]);
    expect(shadowed).toEqual([{ winner: rows[1], loser: rows[0] }]);
  });

  it("memória de outro workspace não aparece", () => {
    const rows = [
      row({ path: "a", scope: "workspace", workspaceId: "ws1" }),
      row({ path: "b", scope: "workspace", workspaceId: "ws2", slug: "outra" }),
    ];

    const { visible } = resolveVisible(rows, { workspaceId: "ws1" });

    expect(visible.map((entry) => entry.path)).toEqual(["a"]);
  });

  it("memória de projeto vizinho não vaza por herança", () => {
    const rows = [
      row({ path: "a", scope: "project", workspaceId: "ws1", projectId: "p1" }),
      row({ path: "b", scope: "project", workspaceId: "ws1", projectId: "p2", slug: "vizinha" }),
    ];

    const { visible } = resolveVisible(rows, { workspaceId: "ws1", projectId: "p1" });

    // Q26 diz que ler é livre — mas por **pergunta**, não por herança silenciosa.
    expect(visible.map((entry) => entry.path)).toEqual(["a"]);
  });

  it("identidades diferentes convivem, mesmo no mesmo escopo", () => {
    const rows = [
      row({ path: "a", type: "user", slug: "estilo" }),
      row({ path: "b", type: "feedback", slug: "estilo" }),
    ];

    const { visible, shadowed } = resolveVisible(rows);

    // A identidade é o par `(tipo, slug)`: mesmo slug com tipo diferente não colide.
    expect(visible).toHaveLength(2);
    expect(shadowed).toHaveLength(0);
  });

  it("empate no mesmo escopo fica com a mais recente, e o sombreamento é registrado", () => {
    const rows = [
      row({ path: "velha", updatedAt: new Date("2026-08-01T00:00:00Z") }),
      row({ path: "nova", updatedAt: new Date("2026-08-10T00:00:00Z") }),
    ];

    const { visible, shadowed } = resolveVisible(rows);

    expect(visible[0]?.path).toBe("nova");
    expect(shadowed[0]?.loser.path).toBe("velha");
  });
});
