import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { ensureMemoryHome } from "./home.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

async function service() {
  const stateDir = join(tempDir("lumem-recall-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const db = openTestDb();
  databases.push(db);
  return { memory: new MemoryService({ db: db.db, stateDir }), stateDir };
}

async function seed(memory: MemoryService) {
  await memory.write({
    name: "Gate rápido",
    description: "pnpm gate:quick roda os testes afetados pelo trabalho atual",
    type: "project",
    body: "O gate completo é `pnpm gate:full`, com Playwright.",
    actor: "human",
    workspaceId: "ws1",
    projectId: "p1",
  });
  await memory.write({
    name: "Contrato de checkout",
    description: "api expõe POST /v2/checkout e o web consome",
    type: "contract",
    body: "O corpo carrega itens e cupom.",
    actor: "human",
    workspaceId: "ws1",
  });
  await memory.write({
    name: "Estilo de revisão",
    description: "Achado com arquivo e linha antes do texto",
    type: "user",
    body: "Sem preâmbulo.",
    actor: "human",
  });
}

describe("busca lexical", () => {
  it("acha pela descrição e pelo corpo", async () => {
    const { memory } = await service();
    await seed(memory);

    const porDescricao = memory.search("checkout consome", { workspaceId: "ws1" });
    expect(porDescricao.hits[0]?.entry.slug).toBe("contrato-de-checkout");

    const porCorpo = memory.search("playwright completo", { workspaceId: "ws1", projectId: "p1" });
    expect(porCorpo.hits[0]?.entry.slug).toBe("gate-rapido");
  });

  it("ignora acento — quem busca não digita cedilha", async () => {
    const { memory } = await service();
    await seed(memory);

    const hits = memory.search("revisao estilo").hits;

    expect(hits[0]?.entry.slug).toBe("estilo-de-revisao");
  });

  it("query trivial não busca, e diz que não buscou", async () => {
    const { memory } = await service();
    await seed(memory);

    const result = memory.search("gate");

    // Uma palavra casa com meio acervo: o que voltaria é ruído com aparência de
    // resposta. Devolver vazio **com motivo** é diferente de "não achei nada".
    expect(result.skipped).toBe("trivial_query");
    expect(result.hits).toHaveLength(0);
  });

  it("cada resultado diz por que apareceu", async () => {
    const { memory } = await service();
    await seed(memory);

    const [hit] = memory.search("checkout consome", { workspaceId: "ws1" }).hits;

    expect(hit?.why.join(" ")).toMatch(/lexical=/);
    expect(hit?.why.join(" ")).toMatch(/recencia=/);
    expect(hit?.why.join(" ")).toMatch(/score=/);
  });

  it("não devolve memória fora do escopo ativo", async () => {
    const { memory } = await service();
    await seed(memory);

    // `p2` não tem a memória de projeto do `p1`, e o contrato é do workspace.
    const hits = memory.search("gate quick", { workspaceId: "ws1", projectId: "p2" }).hits;

    expect(hits).toHaveLength(0);
  });

  it("não devolve o que está sombreado", async () => {
    const { memory } = await service();
    await memory.write({
      name: "Convenção",
      description: "camelCase em todo o workspace",
      type: "process",
      body: "regra geral",
      actor: "human",
      workspaceId: "ws1",
    });
    await memory.write({
      name: "Convenção",
      description: "snake_case neste repositório específico",
      type: "process",
      scope: "project",
      body: "regra do projeto",
      actor: "human",
      workspaceId: "ws1",
      projectId: "p1",
    });

    const hits = memory.search("convencao repositorio workspace", {
      workspaceId: "ws1",
      projectId: "p1",
    }).hits;

    // O escopo decide o que existe; o shadow decide o que vale. Buscar tem que
    // respeitar a segunda decisão, senão a busca desmente a lista.
    expect(hits).toHaveLength(1);
    expect(hits[0]?.entry.scope).toBe("project");
  });

  it("apagar tira do índice", async () => {
    const { memory } = await service();
    await seed(memory);

    await memory.forget("user", "Estilo de revisão");

    expect(memory.search("revisao estilo").hits).toHaveLength(0);
  });

  it("reindex reconstrói o índice junto do catálogo", async () => {
    const { memory } = await service();
    await seed(memory);
    memory.search("checkout consome", { workspaceId: "ws1" });

    await memory.reindex();

    // Um reindex que deixasse o FTS5 para trás produziria busca que não acha o
    // que a lista mostra.
    expect(memory.search("checkout consome", { workspaceId: "ws1" }).hits).toHaveLength(1);
  });
});

describe("sinal de uso", () => {
  it("recuperar sobe o contador da memória recuperada", async () => {
    const { memory } = await service();
    await seed(memory);

    memory.search("checkout consome", { workspaceId: "ws1" });
    memory.search("checkout consome", { workspaceId: "ws1" });

    const summary = memory.usageSummary();
    const recallRow = summary.find((row) => row.kind === "recall");
    expect(recallRow?.events).toBe(2);
    expect(recallRow?.totalAmount).toBe(2);
  });

  it("query trivial também é registrada — saber que ninguém achou nada importa", async () => {
    const { memory } = await service();
    await seed(memory);

    memory.search("gate");

    const recallRow = memory.usageSummary().find((row) => row.kind === "recall");
    expect(recallRow?.events).toBe(1);
    expect(recallRow?.totalAmount).toBe(0);
  });

  it("o resumo separa por tipo de uso", async () => {
    const { memory } = await service();
    await seed(memory);
    memory.search("checkout consome", { workspaceId: "ws1" });
    memory.recordUsage("inject", 1_800);

    const kinds = memory.usageSummary().map((row) => row.kind);

    // É o §6 do context-delivery: o custo fixo injetado e as perguntas feitas
    // são números diferentes, e é a comparação entre eles que decide o desenho.
    expect(kinds).toContain("recall");
    expect(kinds).toContain("inject");
  });
});
