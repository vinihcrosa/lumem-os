import { rm } from "node:fs/promises";
import { join } from "node:path";

import { newId } from "@lumem/shared";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { memorySignal } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { ensureMemoryHome } from "./home.js";
import { indexEntry, indexIsStale } from "./recall.js";

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
  return { memory: new MemoryService({ db: db.db, stateDir }), stateDir, db: db.db };
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

/** Envelhece uma memória no catálogo. É a recência virando dado de teste. */
function age(db: Db, slug: string, days: number): void {
  db.run(
    sql`UPDATE memory_entry SET updated_at = ${Date.now() - days * 86_400_000} WHERE slug = ${slug}`,
  );
}

/**
 * Enfia memórias direto no catálogo e no índice, sem passar pelo disco.
 *
 * É o único jeito de montar um acervo grande o bastante para provar o corte do
 * `MATCH` sem pagar um commit git por linha.
 */
function bulk(db: Db, count: number, workspaceId: string, text: string): void {
  for (let index = 0; index < count; index += 1) {
    const path = `workspaces/${workspaceId}/memory/domain/ruido-${index}.md`;
    db.run(
      sql`INSERT INTO memory_entry
          (id, path, type, scope, slug, workspace_id, project_id, name, description,
           source_actor, confidence, content_hash)
          VALUES (${newId()}, ${path}, 'domain', 'workspace', ${`ruido-${index}`},
                  ${workspaceId}, NULL, ${text}, ${text}, 'human', 'medium', ${`h${index}`})`,
    );
    indexEntry(db, path, text, text, `ruido-${index}`, text);
  }
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

  it("termo curto e alfabeto não latino são termos, não query trivial", async () => {
    const { memory } = await service();
    await seed(memory);

    // O índice é `unicode61` e aceita qualquer alfabeto. Cortar em `a-z0-9` e em
    // três caracteres fazia a busca responder "não busquei porque é trivial"
    // quando o que houve foi falha de tokenização.
    expect(memory.search("ui do editor").skipped).toBeNull();
    expect(memory.search("api v2").skipped).toBeNull();
    expect(memory.search("デプロイ 設定").skipped).toBeNull();
    expect(memory.search("как настроить контейнер").skipped).toBeNull();

    // Mas o corte é em 2: uma letra solta não é termo, é sobra de digitação.
    expect(memory.search("x y").skipped).toBe("trivial_query");
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

  it("candidato invisível não consome a vaga do visível", async () => {
    const { memory, db } = await service();
    await memory.write({
      name: "Rollback do checkout",
      description: "como fazer rollback do checkout em produção",
      type: "process",
      body: "reverte o deploy e avisa o time",
      actor: "human",
      workspaceId: "ws1",
    });
    // Sessenta memórias de outro workspace casando **melhor** que a visível: o
    // corte no SQL antes do filtro de escopo devolvia `hits: 0` aqui.
    bulk(db, 60, "ws2", "rollback checkout rollback checkout");

    const hits = memory.search("rollback checkout", { workspaceId: "ws1" }).hits;

    expect(hits).toHaveLength(1);
    expect(hits[0]?.entry.slug).toBe("rollback-do-checkout");
  });

  it("respeita o limite pedido", async () => {
    const { memory, db } = await service();
    bulk(db, 6, "ws1", "deploy do carrinho");

    expect(memory.search("deploy carrinho", { workspaceId: "ws1" }).hits).toHaveLength(5);
    expect(
      memory.search("deploy carrinho", { workspaceId: "ws1", limit: 2 }).hits,
    ).toHaveLength(2);
  });

  it("apagar tira do índice", async () => {
    const { memory, db } = await service();
    await seed(memory);

    await memory.forget("user", "Estilo de revisão");

    expect(memory.search("revisao estilo").hits).toHaveLength(0);
    // E tira **do índice**, não só do catálogo: linha órfã no FTS5 deixa o
    // índice atrasado em relação à lista, que é o que o boot tem que consertar.
    expect(indexIsStale(db)).toBe(false);
  });

  it("reindex tira do índice o que sumiu do disco", async () => {
    const { memory, db, stateDir } = await service();
    await seed(memory);
    const alvo = memory.list().find((row) => row.slug === "estilo-de-revisao");
    await rm(join(stateDir, alvo?.path ?? ""), { force: true });

    await memory.reindex();

    // Refazer entrada por entrada deixaria a linha do arquivo que sumiu para
    // trás: o índice tem que ser **refeito**, não remendado.
    expect(indexIsStale(db)).toBe(false);
    expect(memory.search("revisao estilo").hits).toHaveLength(0);
  });

  it("índice ausente não se declara em dia, e a busca avisa", async () => {
    const { memory, db } = await service();
    await seed(memory);

    // Todo banco anterior a esta feature é isto: catálogo de pé, índice nunca
    // criado. Preencher a partir do catálogo faria as contagens baterem com um
    // índice **sem corpo** — atrasado para sempre e se dizendo em dia.
    db.run(sql`DROP TABLE memory_fts`);

    const antes = memory.search("checkout consome", { workspaceId: "ws1" });
    expect(antes.staleIndex).toBe(true);

    // E o estado sobrevive à busca: quem chegar depois — o boot, a CLI — ainda
    // encontra o índice se declarando atrasado, e conserta.
    expect(indexIsStale(db)).toBe(true);
    await memory.ensureIndexFresh();
    const depois = memory.search("checkout consome", { workspaceId: "ws1" });
    expect(depois.hits).toHaveLength(1);
    expect(depois.staleIndex).toBe(false);
  });

  it("escrever num banco legado não falsifica o frescor do índice", async () => {
    const { memory, db } = await service();
    await seed(memory);
    db.run(sql`DROP TABLE memory_fts`);

    // Uma escrita indexa **uma** memória. Se ela deixasse o índice "em dia", as
    // outras três nunca mais seriam encontráveis e ninguém voltaria para ver.
    await memory.write({
      name: "Nota nova",
      description: "escrita depois do índice sumir",
      type: "user",
      body: "texto",
      actor: "human",
    });

    expect(indexIsStale(db)).toBe(true);
    const { rebuilt, indexed } = await memory.ensureIndexFresh();
    expect(rebuilt).toBe(true);
    expect(indexed).toBe(4);
    // Pelo corpo: só volta se o reparo releu o disco.
    expect(
      memory.search("playwright completo", { workspaceId: "ws1", projectId: "p1" }).hits,
    ).toHaveLength(1);
  });

  it("linha órfã no índice também é atraso", async () => {
    const { memory, db } = await service();
    await seed(memory);
    indexEntry(db, "workspaces/ws1/memory/user_fantasma.md", "Fantasma", "não existe", "fantasma", "");

    // Atraso não é só "falta"; é **divergência**. Comparar só a existência da
    // tabela deixaria passar índice com linha a mais.
    expect(indexIsStale(db)).toBe(true);
    expect(memory.search("checkout consome", { workspaceId: "ws1" }).staleIndex).toBe(true);
  });

  it("reindex reconstrói o índice do zero, com corpo e tudo", async () => {
    const { memory, db } = await service();
    await seed(memory);
    db.run(sql`DROP TABLE memory_fts`);

    await memory.reindex();

    // Um reindex que deixasse o FTS5 para trás produziria busca que não acha o
    // que a lista mostra. E o corpo só volta se o reindex reler o disco: o
    // catálogo não guarda texto.
    expect(memory.search("checkout consome", { workspaceId: "ws1" }).hits).toHaveLength(1);
    expect(
      memory.search("playwright completo", { workspaceId: "ws1", projectId: "p1" }).hits,
    ).toHaveLength(1);
  });
});

describe("índice derivado", () => {
  it("o boot reconstrói o índice quando ele está atrasado", async () => {
    const { memory, db } = await service();
    await seed(memory);
    db.run(sql`DROP TABLE memory_fts`);

    const primeiro = await memory.ensureIndexFresh();
    const segundo = await memory.ensureIndexFresh();

    expect(primeiro.rebuilt).toBe(true);
    expect(primeiro.indexed).toBe(3);
    // Idempotente: índice em dia não paga leitura de disco nenhuma.
    expect(segundo).toEqual({ rebuilt: false, indexed: 0, failures: [] });
    expect(
      memory.search("playwright completo", { workspaceId: "ws1", projectId: "p1" }).hits,
    ).toHaveLength(1);
  });
});

describe("ranking", () => {
  it("casamento forte e antigo ganha de casamento fraco e recente", async () => {
    const { memory, db } = await service();
    // O acervo de fundo não é enfeite: com dois documentos o IDF do BM25 colapsa
    // e todo mundo tira zero. É preciso acervo para haver termo raro.
    bulk(db, 20, "ws1", "assunto qualquer sem relacao");
    await memory.write({
      name: "Rollback do checkout",
      description: "como fazer rollback do checkout em produção",
      type: "process",
      body: "rollback do checkout, passo a passo",
      actor: "human",
      workspaceId: "ws1",
    });
    await memory.write({
      name: "Nota solta",
      description: "lembrete sem assunto",
      type: "user",
      body: "rollback",
      actor: "human",
      workspaceId: "ws1",
    });
    age(db, "rollback-do-checkout", 90);

    const hits = memory.search("rollback checkout", { workspaceId: "ws1" }).hits;

    // O peso maior é o lexical: recência é desempate, não critério. Se o score
    // fosse a recência, a nota solta de hoje venceria a resposta da pergunta.
    expect(hits[0]?.entry.slug).toBe("rollback-do-checkout");
  });

  it("com o mesmo casamento lexical, a mais recente ganha", async () => {
    const { memory, db } = await service();
    await memory.write({
      name: "Alpha um",
      description: "deploy do carrinho",
      type: "process",
      body: "",
      actor: "human",
      workspaceId: "ws1",
    });
    await memory.write({
      name: "Alpha dois",
      description: "deploy do carrinho",
      type: "process",
      body: "",
      actor: "human",
      workspaceId: "ws1",
    });
    age(db, "alpha-um", 60);

    const hits = memory.search("deploy carrinho", { workspaceId: "ws1" }).hits;

    expect(hits.map((hit) => hit.entry.slug)).toEqual(["alpha-dois", "alpha-um"]);
    // Empate é casamento **cheio** para os dois, não zero para os dois: quem
    // decide é a recência, e o lexical não pode virar penalidade silenciosa.
    for (const hit of hits) expect(hit.why).toContain("lexical=1.000");
  });

  it("o limite pedido não muda quem está no topo", async () => {
    const { memory, db } = await service();
    bulk(db, 20, "ws1", "assunto qualquer sem relacao");
    await memory.write({
      name: "Rollback checkout completo",
      description: "rollback checkout rollback checkout",
      type: "process",
      body: "rollback checkout rollback checkout",
      actor: "human",
      workspaceId: "ws1",
    });
    await memory.write({
      name: "Rollback checkout parcial",
      description: "rollback checkout",
      type: "process",
      body: "rollback do checkout",
      actor: "human",
      workspaceId: "ws1",
    });
    await memory.write({
      name: "Nota de rollback",
      description: "menciona rollback de leve",
      type: "user",
      body: "rollback",
      actor: "human",
      workspaceId: "ws1",
    });
    age(db, "rollback-checkout-completo", 120);

    const cinco = memory.search("rollback checkout", { workspaceId: "ws1" }).hits;
    const um = memory.search("rollback checkout", { workspaceId: "ws1", limit: 1 }).hits;

    // O pool de candidatos é fixo de propósito: min–max é escala, e um pool que
    // encolhe com o `limit` faria "mostre menos" trocar o primeiro colocado.
    expect(um[0]?.entry.slug).toBe(cinco[0]?.entry.slug);
    expect(um[0]?.entry.slug).toBe("rollback-checkout-parcial");
  });

  it("casamento na descrição vale mais que casamento no corpo", async () => {
    const { memory, db } = await service();
    bulk(db, 20, "ws1", "assunto qualquer sem relacao");
    await memory.write({
      name: "Alpha um",
      description: "estorno duplicado",
      type: "process",
      body: "nada relevante",
      actor: "human",
      workspaceId: "ws1",
    });
    await memory.write({
      name: "Alpha dois",
      description: "nada relevante",
      type: "process",
      body: "estorno duplicado",
      actor: "human",
      workspaceId: "ws1",
    });

    const hits = memory.search("estorno duplicado", { workspaceId: "ws1" }).hits;

    // Descrição pesa 3, corpo pesa 1 — e as duas memórias são simétricas em
    // tudo o mais. Sem os pesos por coluna elas empatariam, e a segunda, por ser
    // a mais recente, ganharia o desempate.
    expect(hits[0]?.entry.slug).toBe("alpha-um");
  });

  it("a recência cai pela metade em catorze dias", async () => {
    const { memory, db } = await service();
    await seed(memory);
    age(db, "contrato-de-checkout", 14);

    const [hit] = memory.search("checkout consome", { workspaceId: "ws1" }).hits;

    // A meia-vida é 14 dias. Escrita como número no `why`, ela para de ser
    // constante que ninguém confere.
    expect(hit?.why).toContain("recencia=0.500");
  });

  it("o lexical entra normalizado, na mesma escala dos outros dois", async () => {
    const { memory, db } = await service();
    bulk(db, 20, "ws1", "assunto qualquer sem relacao");
    await memory.write({
      name: "Rollback do checkout",
      description: "como fazer rollback do checkout em produção",
      type: "process",
      body: "rollback do checkout, passo a passo",
      actor: "human",
      workspaceId: "ws1",
    });
    await memory.write({
      name: "Nota solta",
      description: "lembrete sem assunto",
      type: "user",
      body: "rollback",
      actor: "human",
      workspaceId: "ws1",
    });

    const hits = memory.search("rollback checkout", { workspaceId: "ws1" }).hits;
    const value = (hit: (typeof hits)[number] | undefined, key: string) =>
      Number((hit?.why.find((line) => line.startsWith(`${key}=`)) ?? "").split("=")[1]);

    // Somar bm25 cru a uma recência em [0, 1] é somar escalas incompatíveis: ou
    // o lexical é ruído, ou ele engole os outros dois. Nunca os três juntos.
    expect(value(hits[0], "bm25")).toBeGreaterThan(value(hits[1], "bm25"));
    expect(value(hits[0], "lexical")).toBe(1);
    expect(value(hits[1], "lexical")).toBe(0);
    for (const hit of hits) {
      expect(value(hit, "score")).toBeCloseTo(
        0.7 * value(hit, "lexical") + 0.2 * value(hit, "recencia") + 0.1 * value(hit, "uso"),
        3,
      );
    }
  });
});

describe("sinal de uso", () => {
  it("recuperar sobe o contador da memória recuperada", async () => {
    const { memory, db } = await service();
    await seed(memory);

    memory.search("checkout consome", { workspaceId: "ws1", record: true });
    const [hit] = memory.search("checkout consome", { workspaceId: "ws1", record: true }).hits;

    const [signal] = db.select().from(memorySignal).all();
    expect(signal?.path).toContain("contrato-de-checkout");
    expect(signal?.recallCount).toBe(2);
    expect(signal?.bestScore).toBeGreaterThanOrEqual(0);
    expect(signal?.lastRecalledAt).not.toBeNull();
    // Na segunda busca o sinal da primeira já conta: 1 de 3 recuperações.
    expect(hit?.why).toContain("uso=0.333");
  });

  it("busca de inspeção não registra — o contador mede uso, não refetch", async () => {
    const { memory, db } = await service();
    await seed(memory);

    memory.search("checkout consome", { workspaceId: "ws1" });

    expect(db.select().from(memorySignal).all()).toHaveLength(0);
    expect(memory.usageSummary()).toHaveLength(0);
  });

  it("apagar apaga o sinal junto", async () => {
    const { memory, db } = await service();
    await seed(memory);
    memory.search("checkout consome", { workspaceId: "ws1", record: true });

    await memory.forget("contract", "Contrato de checkout", undefined, { workspaceId: "ws1" });

    // O caminho é derivado de `(tipo, slug)`: sem isto, a memória recriada com o
    // mesmo nome herda o contador da apagada.
    expect(db.select().from(memorySignal).all()).toHaveLength(0);
  });

  it("os números do §6 contam evento, resultado e sessão", async () => {
    const { memory } = await service();
    await seed(memory);

    memory.search("checkout consome", { workspaceId: "ws1", record: true, sessionId: "s1" });
    memory.search("checkout consome", { workspaceId: "ws1", record: true, sessionId: "s2" });

    const recallRow = memory.usageSummary().find((row) => row.kind === "recall");
    expect(recallRow?.events).toBe(2);
    expect(recallRow?.totalAmount).toBe(2);
    expect(recallRow?.sessions).toBe(2);
  });

  it("sessão repetida conta uma vez, e sem sessão não conta nenhuma", async () => {
    const { memory } = await service();
    await seed(memory);

    memory.search("checkout consome", { workspaceId: "ws1", record: true, sessionId: "s1" });
    memory.search("checkout consome", { workspaceId: "ws1", record: true, sessionId: "s1" });
    memory.search("checkout consome", { workspaceId: "ws1", record: true });

    // "Quantas perguntas" e "de quantas sessões" são números diferentes, e é a
    // distância entre eles que o §6 lê.
    const recallRow = memory.usageSummary().find((row) => row.kind === "recall");
    expect(recallRow?.events).toBe(3);
    expect(recallRow?.sessions).toBe(1);
  });

  it("desfazer uma criação apaga o sinal junto", async () => {
    const { memory, db } = await service();
    await seed(memory);
    memory.search("checkout consome", { workspaceId: "ws1", record: true });
    const [signal] = db.select().from(memorySignal).all();

    await memory.revert(signal?.path ?? "");

    // Reverter a criação **apaga** a memória, e o caminho é derivado de
    // `(tipo, slug)`: o contador não pode sobreviver para ser herdado.
    expect(db.select().from(memorySignal).all()).toHaveLength(0);
  });

  it("o melhor score guardado é o bm25 cru, não o normalizado", async () => {
    const { memory, db } = await service();
    await seed(memory);

    const [hit] = memory.search("checkout consome", { workspaceId: "ws1", record: true }).hits;

    // Resultado único tira lexical=1 e score ≥ 0,7 por construção. Guardar isso
    // faria `best_score` saturar para qualquer memória — e ele é o critério
    // objetivo da poda da Q25.
    expect(hit?.why).toContain("lexical=1.000");
    const [signal] = db.select().from(memorySignal).all();
    expect(signal?.bestScore).toBe(hit?.bm25);
    expect(signal?.bestScore).not.toBe(hit?.score);
  });

  it("query trivial também é registrada — saber que ninguém achou nada importa", async () => {
    const { memory } = await service();
    await seed(memory);

    memory.search("gate", { record: true });

    const recallRow = memory.usageSummary().find((row) => row.kind === "recall");
    expect(recallRow?.events).toBe(1);
    expect(recallRow?.totalAmount).toBe(0);
  });

  it("o resumo separa por tipo de uso", async () => {
    const { memory } = await service();
    await seed(memory);
    memory.search("checkout consome", { workspaceId: "ws1", record: true });
    memory.recordUsage("inject", 1_800, 0, { sessionId: "s1", workspaceId: "ws1" });

    const kinds = memory.usageSummary().map((row) => row.kind);

    // É o §6 do context-delivery: o custo fixo injetado e as perguntas feitas
    // são números diferentes, e é a comparação entre eles que decide o desenho.
    expect(kinds).toContain("recall");
    expect(kinds).toContain("inject");
  });
});
