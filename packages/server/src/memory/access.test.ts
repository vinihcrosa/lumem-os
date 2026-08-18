import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { memoryAccess, project, workspace } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { checkAccess, listAccess, requireAccess } from "./access.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

function db(): TestDb {
  const database = openTestDb();
  databases.push(database);
  return database;
}

/**
 * Um projeto de verdade, com raiz no disco.
 *
 * O funil resolve caminho com `realpath`, e um caminho inventado responderia
 * "não existe" a todo pedido — o teste passaria sem provar a contenção.
 */
function addProject(database: TestDb, workspaceId: string, projectId: string): string {
  const root = tempDir("lumem-access-");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "api.ts"), "export const api = 1;\n");

  const existing = database.db.select().from(workspace).all();
  if (!existing.some((row) => row.id === workspaceId)) {
    database.db.insert(workspace).values({ id: workspaceId, name: workspaceId }).run();
  }
  database.db
    .insert(project)
    .values({ id: projectId, workspaceId, name: projectId, path: root, defaultBranch: "main" })
    .run();
  return root;
}

const pedido = {
  fromProjectId: "p1",
  targetProjectId: "p2",
  workspaceId: "ws1",
  target: "contract/checkout",
  actor: "agent",
};

describe("funil de acesso", () => {
  it("ler memória de projeto vizinho é livre — é o ponto do workspace", async () => {
    const database = db();

    const result = await checkAccess(database.db, { ...pedido, kind: "memory" });

    expect(result.decision).toBe("allowed");
  });

  it("ler arquivo de repositório vizinho é negado nesta versão", async () => {
    const database = db();
    addProject(database, "ws1", "p2");

    const result = await checkAccess(database.db, {
      ...pedido,
      kind: "repository",
      target: "src/api.ts",
    });

    // D8: o objetivo é declarado, a capacidade nasce desligada.
    expect(result.decision).toBe("denied");
    expect(result.reason).toContain("desligado");
  });

  it("com a capacidade ligada, o arquivo **dentro** da raiz do alvo é permitido", async () => {
    const database = db();
    addProject(database, "ws1", "p2");

    const result = await checkAccess(
      database.db,
      { ...pedido, kind: "repository", target: "src/api.ts" },
      { readNeighbourRepository: true },
    );

    expect(result.decision).toBe("allowed");
    expect(result.reason).toBeNull();
  });

  it("capacidade ligada não é passe livre: caminho absoluto e `..` continuam negados", async () => {
    const database = db();
    addProject(database, "ws1", "p2");
    const ligada = { readNeighbourRepository: true };

    const absoluto = await checkAccess(
      database.db,
      { ...pedido, kind: "repository", target: "/etc/passwd" },
      ligada,
    );
    const acima = await checkAccess(
      database.db,
      { ...pedido, kind: "repository", target: "../vizinho/segredo.env" },
      ligada,
    );
    const inexistente = await checkAccess(
      database.db,
      { ...pedido, kind: "repository", target: "src/nao-existe.ts" },
      ligada,
    );

    // A guarda de caminho da `file-editor`, reusada: relativo, contido, e
    // `realpath` decidindo — as três coisas que a D8 exige junto da capacidade.
    expect(absoluto.decision).toBe("denied");
    expect(absoluto.reason).toContain("relativo");
    expect(acima.decision).toBe("denied");
    expect(acima.reason).toContain("sai do checkout");
    expect(inexistente.decision).toBe("denied");
  });

  it("capacidade ligada não alcança o `.git` do vizinho", async () => {
    const database = db();
    const root = addProject(database, "ws1", "p2");
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "config"), "[remote \"origin\"]\n  url = https://x:token@git\n");

    const result = await checkAccess(
      database.db,
      { ...pedido, kind: "repository", target: ".git/config" },
      { readNeighbourRepository: true },
    );

    // A `file-editor` deixa `.git` legível porque ali é o seu projeto na sua tela
    // (right-panel Q2). Aqui é outro projeto lido por um agente, e `.git/config`
    // costuma carregar URL de remote com token dentro.
    expect(result.decision).toBe("denied");
    expect(result.reason).toContain(".git");
  });

  it("sem workspace de origem, o funil nega dizendo qual é a fronteira", async () => {
    const database = db();
    addProject(database, "ws1", "p2");

    const result = await checkAccess(
      database.db,
      { ...pedido, workspaceId: null, kind: "repository", target: "src/api.ts" },
      { readNeighbourRepository: true },
    );

    expect(result.decision).toBe("denied");
    expect(result.reason).toContain("sem workspace de origem");
  });

  it("capacidade ligada só alcança projeto **do mesmo workspace**", async () => {
    const database = db();
    addProject(database, "ws1", "p2");
    addProject(database, "ws2", "outro");
    const ligada = { readNeighbourRepository: true };

    const vizinhoDeOutroWorkspace = await checkAccess(
      database.db,
      { ...pedido, targetProjectId: "outro", kind: "repository", target: "src/api.ts" },
      ligada,
    );
    const projetoInexistente = await checkAccess(
      database.db,
      { ...pedido, targetProjectId: "fantasma", kind: "repository", target: "src/api.ts" },
      ligada,
    );
    const semAlvo = await checkAccess(
      database.db,
      { ...pedido, targetProjectId: null, kind: "repository", target: "src/api.ts" },
      ligada,
    );

    // A fronteira do §11 é o workspace, e a lista de projetos alcançáveis é a
    // dele — no banco, não numa allowlist paralela.
    expect(vizinhoDeOutroWorkspace.decision).toBe("denied");
    expect(vizinhoDeOutroWorkspace.reason).toContain("não pertence ao workspace");
    expect(projetoInexistente.decision).toBe("denied");
    expect(semAlvo.decision).toBe("denied");
  });

  it("registra os dois casos — inclusive o negado", async () => {
    const database = db();
    await checkAccess(database.db, { ...pedido, kind: "memory" });
    await checkAccess(database.db, { ...pedido, kind: "repository", target: "src/x.ts" });

    const rows = listAccess(database.db);

    // Registrar só o permitido responde "o que foi lido". Registrar o negado
    // responde "o que alguém tentou ler", que é a pergunta que importa depois.
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.decision).sort()).toEqual(["allowed", "denied"]);
    expect(rows.find((row) => row.decision === "denied")?.target).toBe("src/x.ts");
  });

  it("o registro guarda quem tentou ler o quê, de onde — campo a campo", async () => {
    const database = db();

    await checkAccess(database.db, { ...pedido, kind: "memory" });

    // Cada coluna é uma pergunta que a auditoria faz. Conferir só o `decision`
    // deixava passar um insert que perdia exatamente as outras.
    expect(listAccess(database.db)[0]).toMatchObject({
      workspaceId: "ws1",
      fromProjectId: "p1",
      targetProjectId: "p2",
      kind: "memory",
      target: "contract/checkout",
      decision: "allowed",
      reason: null,
      actor: "agent",
    });
  });

  it("o registro sai do mais recente para o mais antigo", () => {
    const database = db();
    const linha = (id: string, createdAt: Date) => ({
      id,
      workspaceId: "ws1",
      fromProjectId: "p1",
      targetProjectId: "p2",
      kind: "memory" as const,
      target: id,
      decision: "allowed" as const,
      reason: null,
      actor: "agent",
      createdAt,
      updatedAt: createdAt,
    });
    database.db.insert(memoryAccess).values(linha("antiga", new Date(1_000))).run();
    database.db.insert(memoryAccess).values(linha("recente", new Date(2_000))).run();

    // Sem ordem, o `limit` devolve os mais antigos e a auditoria para de mostrar
    // o que acabou de acontecer.
    expect(listAccess(database.db, 1).map((row) => row.id)).toEqual(["recente"]);
  });

  it("requireAccess estoura com erro de domínio, e o registro fica", async () => {
    const database = db();

    await expect(
      requireAccess(database.db, { ...pedido, kind: "repository", target: "src/x.ts" }),
    ).rejects.toThrow(DomainError);
    expect(listAccess(database.db)).toHaveLength(1);
  });
});
