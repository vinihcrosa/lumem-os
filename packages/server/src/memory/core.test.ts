import { describe, expect, it } from "vitest";

import type { MemoryEntryRow } from "../db/schema.js";

import { pinnedFor, renderCore } from "./core.js";

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
    pinned: true,
    contentHash: "h",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  } as MemoryEntryRow;
}

const NOW = new Date("2026-08-20T00:00:00Z");

describe("pinnedFor", () => {
  it("só o que foi fixado — memória curta não entra por ser curta", () => {
    const rows = [
      row({ path: "a", slug: "a", pinned: true }),
      row({ path: "b", slug: "b", pinned: false }),
    ];

    expect(pinnedFor(rows).map((entry) => entry.path)).toEqual(["a"]);
  });

  it("do geral para o específico: global, workspace, projeto", () => {
    const rows = [
      row({ path: "p", slug: "p", scope: "project", workspaceId: "ws1", projectId: "p1" }),
      row({ path: "g", slug: "g", scope: "global" }),
      row({ path: "w", slug: "w", scope: "workspace", workspaceId: "ws1" }),
    ];

    const order = pinnedFor(rows, { workspaceId: "ws1", projectId: "p1" }).map((e) => e.path);

    // Quem lê por último decide: a diretriz do projeto refina a global.
    expect(order).toEqual(["g", "w", "p"]);
  });

  it("memória sombreada não entra: ela perdeu", () => {
    // A mesma identidade nos dois escopos. A fixada é a **perdedora** — sem a
    // precedência antes do filtro, a regra vencida entraria em todo turno.
    const rows = [
      row({ path: "global", scope: "global", pinned: true }),
      row({ path: "projeto", scope: "project", workspaceId: "ws1", projectId: "p1", pinned: false }),
    ];

    expect(pinnedFor(rows, { workspaceId: "ws1", projectId: "p1" })).toEqual([]);
  });

  it("empate de escopo resolve pelo nome, para o núcleo ser estável entre sessões", () => {
    const rows = [
      row({ path: "z", slug: "z", name: "Zebra" }),
      row({ path: "a", slug: "a", name: "Abacate" }),
    ];

    expect(pinnedFor(rows).map((entry) => entry.name)).toEqual(["Abacate", "Zebra"]);
  });
});

describe("renderCore", () => {
  it("nada fixado é núcleo vazio, e núcleo vazio não é bloco vazio", () => {
    expect(renderCore([], NOW)).toEqual({ text: "", entries: [], chars: 0, recentChars: 0 });
  });

  it("o corpo da memória vai inteiro — sem teto, sem corte (D5)", () => {
    const body = "x".repeat(5_000);
    const core = renderCore([{ row: row(), body }], NOW);

    expect(core.text).toContain(body);
  });

  it("cada escopo se anuncia uma vez, não uma por entrada", () => {
    const core = renderCore(
      [
        { row: row({ path: "a", slug: "a", name: "Um" }), body: "um" },
        { row: row({ path: "b", slug: "b", name: "Dois" }), body: "dois" },
      ],
      NOW,
    );

    expect(core.text.match(/## Suas preferências/g)).toHaveLength(1);
    expect(core.text).toContain("### Um");
    expect(core.text).toContain("### Dois");
  });

  it("a marca d'água mede o texto inteiro, e atribui o custo entrada por entrada", () => {
    const core = renderCore(
      [
        { row: row({ path: "a", slug: "a", name: "Um" }), body: "um" },
        { row: row({ path: "b", slug: "b", name: "Dois" }), body: "dois" },
      ],
      NOW,
    );

    expect(core.chars).toBe(core.text.length);
    // O total é maior que a soma das entradas: o cabeçalho do bloco também é
    // pago, e medir só as entradas daria um número mais bonito do que a conta.
    const sum = core.entries.reduce((total, entry) => total + entry.chars, 0);
    expect(core.chars).toBeGreaterThan(sum);
    expect(core.entries.map((entry) => entry.name)).toEqual(["Um", "Dois"]);
  });

  it("a variação diz quanto entrou nos últimos 30 dias", () => {
    const core = renderCore(
      [
        { row: row({ path: "velha", slug: "velha", createdAt: new Date("2026-01-01T00:00:00Z") }), body: "v" },
        { row: row({ path: "nova", slug: "nova", name: "Nova", createdAt: new Date("2026-08-18T00:00:00Z") }), body: "n" },
      ],
      NOW,
    );

    const nova = core.entries.find((entry) => entry.name === "Nova");
    expect(core.recentChars).toBe(nova?.chars);
    expect(core.recentChars).toBeLessThan(core.chars);
  });
});
