import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { memoryEntry } from "../db/schema.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { hashContent, listEntries, reindex } from "./catalog.js";
import { serializeEntry, type MemoryEntry } from "./entry.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

function state(): { stateDir: string; db: TestDb } {
  const stateDir = join(tempDir("lumem-catalog-"), ".lumem");
  const db = openTestDb();
  databases.push(db);
  return { stateDir, db };
}

/** Uma memória válida no disco, no caminho que o chamador escolher. */
function put(stateDir: string, relativePath: string, entry: Partial<MemoryEntry> = {}): void {
  const full: MemoryEntry = {
    name: "Estilo de revisão",
    description: "Achado com arquivo e linha antes do texto",
    type: "user",
    scope: "global",
    provenance: {
      source_actor: "human",
      source_sessions: [],
      confidence: "medium",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    body: "Achado primeiro.",
    ...entry,
  };
  const absolute = join(stateDir, relativePath);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, serializeEntry(full), "utf8");
}

describe("hashContent", () => {
  /**
   * O teste que faltava, e a mutação que ele mata é literal: trocar o corpo de
   * `hashContent` por uma constante deixava a suíte inteira verde. O hash é o
   * que a PR 02 vai usar para reconhecer duplicata exata — uma constante ali
   * diria que **toda** memória é a mesma.
   */
  it("distingue conteúdos diferentes e repete o mesmo conteúdo", () => {
    expect(hashContent("uma coisa")).not.toBe(hashContent("outra coisa"));
    expect(hashContent("uma coisa")).toBe(hashContent("uma coisa"));
    // Uma letra de diferença basta: hash truncado ou constante morre aqui.
    expect(hashContent("regra a")).not.toBe(hashContent("regra b"));
  });

  it("é o hash que a linha do catálogo guarda", async () => {
    const { stateDir, db } = state();
    put(stateDir, "memory/user_estilo-de-revisao.md");

    await reindex(db.db, stateDir);

    const [row] = listEntries(db.db);
    const onDisk = readFileSync(join(stateDir, "memory/user_estilo-de-revisao.md"), "utf8");
    expect(row?.contentHash).toBe(hashContent(onDisk));
  });
});

describe("reindex", () => {
  it("não indexa o MEMORY.md, que é a projeção e não a memória", async () => {
    const { stateDir, db } = state();
    put(stateDir, "memory/user_estilo-de-revisao.md");
    // Um `MEMORY.md` **válido como memória**: se o `continue` sumir, ele entra.
    put(stateDir, "memory/MEMORY.md", { name: "Índice", description: "gerado" });

    const result = await reindex(db.db, stateDir);

    expect(result.indexed).toBe(1);
    expect(result.failures).toEqual([]);
    expect(listEntries(db.db).map((row) => row.path)).toEqual(["memory/user_estilo-de-revisao.md"]);
  });

  it("identidade duplicada vira falha, e o catálogo fica inteiro", async () => {
    const { stateDir, db } = state();
    // `slugFromPath` tira o prefixo `<tipo>_`, então estes dois arquivos
    // reivindicam o mesmo `(global, user, alfa)`.
    put(stateDir, "memory/user_alfa.md", { name: "Alfa" });
    put(stateDir, "memory/alfa.md", { name: "Alfa também" });
    put(stateDir, "memory/user_beta.md", { name: "Beta" });

    const result = await reindex(db.db, stateDir);

    expect(result.indexed).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.path).toBe("memory/user_alfa.md");
    expect(result.failures[0]?.reason).toContain("memory/alfa.md");
    // O que importa: as outras continuam indexadas. Antes, o insert que estourava
    // derrubava o comando com o catálogo já apagado e meio preenchido.
    expect(listEntries(db.db).map((row) => row.path).sort()).toEqual([
      "memory/alfa.md",
      "memory/user_beta.md",
    ]);
  });

  it("a mesma (tipo, slug) em escopos diferentes não é duplicata", async () => {
    const { stateDir, db } = state();
    put(stateDir, "memory/user_alfa.md", { name: "Alfa", scope: "global" });
    put(stateDir, "workspaces/ws1/memory/user_alfa.md", { name: "Alfa", scope: "workspace" });
    put(stateDir, "workspaces/ws1/projects/p1/memory/user_alfa.md", { name: "Alfa", scope: "project" });

    const result = await reindex(db.db, stateDir);

    // A identidade é `(escopo, workspace, projeto, tipo, slug)`. Uma chave feita
    // só de `(tipo, slug)` descartaria duas destas como duplicata — memória
    // legítima sumindo em silêncio, e o índice único do banco concordando.
    expect(result.failures).toEqual([]);
    expect(result.indexed).toBe(3);
    expect(
      listEntries(db.db)
        .map((row) => [row.scope, row.workspaceId, row.projectId].join("/"))
        .sort(),
    ).toEqual(["global//", "project/ws1/p1", "workspace/ws1/"]);
  });

  it("é determinístico: repetir devolve as mesmas linhas", async () => {
    const { stateDir, db } = state();
    put(stateDir, "memory/user_alfa.md", { name: "Alfa" });
    put(stateDir, "memory/user_beta.md", { name: "Beta" });

    const first = await reindex(db.db, stateDir);
    const before = listEntries(db.db).map(({ id: _id, ...row }) => row);
    const second = await reindex(db.db, stateDir);
    const after = listEntries(db.db).map(({ id: _id, ...row }) => row);

    expect(second).toEqual(first);
    expect(after).toEqual(before);
  });
});

/**
 * Um `Db` que estoura no segundo `insert`, e em nada mais.
 *
 * O gatilho é um erro **injetado**, e não identidade duplicada: a guarda do
 * `reindex` já filtra a duplicata antes de escrever, então usá-la como gatilho
 * testaria a guarda outra vez em vez da transação. O que precisa de prova aqui é
 * outra coisa: que uma falha no meio da reconstrução não deixa o catálogo pela
 * metade. Envolver o `tx` também é obrigatório — é ele, e não o `db`, que a
 * transação entrega ao corpo.
 */
function estourandoNoSegundoInsert(db: Db, boom: Error): Db {
  let inserts = 0;

  const wrap = (source: Db): Db =>
    new Proxy(source, {
      get(target, property) {
        if (property === "insert") {
          return (...args: Parameters<Db["insert"]>) => {
            inserts += 1;
            if (inserts === 2) throw boom;
            return target.insert(...args);
          };
        }
        if (property === "transaction") {
          return (body: (tx: Db) => unknown) =>
            target.transaction((tx) => body(wrap(tx as unknown as Db)));
        }
        const value = Reflect.get(target, property) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  return wrap(db);
}

describe("reindex — falha no meio da reconstrução", () => {
  it("insert que estoura não deixa o catálogo pela metade", async () => {
    const { stateDir, db } = state();
    put(stateDir, "memory/user_alfa.md", { name: "Alfa" });
    put(stateDir, "memory/user_beta.md", { name: "Beta" });
    await reindex(db.db, stateDir);
    const antes = listEntries(db.db);
    put(stateDir, "memory/user_gama.md", { name: "Gama" });

    const boom = new Error("insert injetado falhou");
    await expect(reindex(estourandoNoSegundoInsert(db.db, boom), stateDir)).rejects.toBe(boom);

    // Fora de transação, o `DELETE` e o primeiro `INSERT` já teriam passado: o
    // comando que existe para reconstruir o índice seria o que o destrói.
    expect(antes).toHaveLength(2);
    expect(listEntries(db.db)).toEqual(antes);
  });
});

describe("identidade no catálogo", () => {
  /**
   * O índice único só vale porque `workspace_id` e `project_id` são `''` fora do
   * escopo em que valem: no SQLite NULL nunca colide com NULL, e com colunas
   * nulas duas memórias globais com a mesma identidade conviveriam.
   */
  it("recusa duas linhas com a mesma identidade em escopo sem workspace", () => {
    const { db } = state();
    const base = {
      type: "user",
      scope: "global",
      slug: "alfa",
      name: "Alfa",
      description: "d",
      sourceActor: "human",
      confidence: "medium",
      contentHash: "h",
    };

    db.db.insert(memoryEntry).values({ ...base, id: "1", path: "memory/user_alfa.md" }).run();

    expect(() =>
      db.db.insert(memoryEntry).values({ ...base, id: "2", path: "memory/alfa.md" }).run(),
    ).toThrow(/UNIQUE/);
  });
});
