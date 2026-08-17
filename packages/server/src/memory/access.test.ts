import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { DomainError } from "../errors.js";

import { checkAccess, listAccess, requireAccess } from "./access.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
});

function db(): TestDb {
  const database = openTestDb();
  databases.push(database);
  return database;
}

const pedido = {
  fromProjectId: "p1",
  targetProjectId: "p2",
  workspaceId: "ws1",
  target: "contract/checkout",
  actor: "agent",
};

describe("funil de acesso", () => {
  it("ler memória de projeto vizinho é livre — é o ponto do workspace", () => {
    const database = db();

    const result = checkAccess(database.db, { ...pedido, kind: "memory" });

    expect(result.decision).toBe("allowed");
  });

  it("ler arquivo de repositório vizinho é negado nesta versão", () => {
    const database = db();

    const result = checkAccess(database.db, {
      ...pedido,
      kind: "repository",
      target: "/repos/p2/src/api.ts",
    });

    // D8: o objetivo é declarado, a capacidade nasce desligada.
    expect(result.decision).toBe("denied");
    expect(result.reason).toContain("desligado");
  });

  it("com a capacidade ligada, o arquivo é permitido", () => {
    const database = db();

    const result = checkAccess(
      database.db,
      { ...pedido, kind: "repository", target: "/repos/p2/src/api.ts" },
      { readNeighbourRepository: true },
    );

    expect(result.decision).toBe("allowed");
  });

  it("registra os dois casos — inclusive o negado", () => {
    const database = db();
    checkAccess(database.db, { ...pedido, kind: "memory" });
    checkAccess(database.db, { ...pedido, kind: "repository", target: "/repos/p2/x.ts" });

    const rows = listAccess(database.db);

    // Registrar só o permitido responde "o que foi lido". Registrar o negado
    // responde "o que alguém tentou ler", que é a pergunta que importa depois.
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.decision).sort()).toEqual(["allowed", "denied"]);
    expect(rows.find((row) => row.decision === "denied")?.target).toBe("/repos/p2/x.ts");
    expect(rows.every((row) => row.fromProjectId === "p1")).toBe(true);
  });

  it("requireAccess estoura com erro de domínio, e o registro fica", () => {
    const database = db();

    expect(() =>
      requireAccess(database.db, { ...pedido, kind: "repository", target: "/repos/p2/x.ts" }),
    ).toThrow(DomainError);
    expect(listAccess(database.db)).toHaveLength(1);
  });
});
