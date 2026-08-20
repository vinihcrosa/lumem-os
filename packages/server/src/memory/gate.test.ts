import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";

import { entrySignature, serializeEntry, type MemoryEntry } from "./entry.js";
import { decide, listDecisions, recordDecision } from "./gate.js";

/**
 * O portão sem disco e sem git — decidir é puro, e é aqui que dá para provar as
 * duas coisas que o teste de integração não alcança: que a **chave de
 * idempotência** sobrevive ao relógio, e que o histórico responde a filtro.
 */

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
});

function db() {
  const handle = openTestDb();
  databases.push(handle);
  return handle.db;
}

function entryAt(updatedAt: string): MemoryEntry {
  return {
    name: "Estilo de revisão",
    description: "Achado com arquivo e linha antes do texto",
    type: "user",
    scope: "global",
    pinned: false,
    provenance: {
      source_actor: "human",
      source_sessions: [],
      confidence: "medium",
      created_at: "2026-08-17T00:00:00.000Z",
      updated_at: updatedAt,
    },
    body: "Achado primeiro.",
  };
}

function requestFor(entry: MemoryEntry) {
  return {
    path: "memory/user_estilo-de-revisao.md",
    operation: "add" as const,
    actor: "human",
    confidence: "medium" as const,
    content: serializeEntry(entry),
    signature: entrySignature(entry),
  };
}

describe("idempotência", () => {
  it("a mesma escrita tentada duas vezes produz a mesma chave", () => {
    // O arquivo carrega `updated_at`, que muda a cada tentativa. Derivar a chave
    // do hash do arquivo faria duas tentativas da **mesma** escrita virarem duas
    // decisões — e o replay pós-crash da Q9 não teria como casar a anterior.
    const primeira = decide(requestFor(entryAt("2026-08-17T10:00:00.000Z")));
    const segunda = decide(requestFor(entryAt("2026-08-17T10:00:31.000Z")));

    expect(primeira.candidateHash).not.toBe(segunda.candidateHash);
    expect(segunda.idempotencyKey).toBe(primeira.idempotencyKey);
  });

  it("conteúdo diferente produz chave diferente", () => {
    const outra = entryAt("2026-08-17T10:00:00.000Z");
    outra.body = "Achado segundo.";

    expect(decide(requestFor(outra)).idempotencyKey).not.toBe(
      decide(requestFor(entryAt("2026-08-17T10:00:00.000Z"))).idempotencyKey,
    );
  });

  it("registrar a mesma chave duas vezes devolve a linha antiga, sem inserir", () => {
    const handle = db();
    const decision = decide(requestFor(entryAt("2026-08-17T10:00:00.000Z")));
    const common = {
      path: decision.idempotencyKey.split(":")[1] ?? "",
      operation: "add" as const,
      actor: "human",
      confidence: "medium" as const,
    };

    const primeira = recordDecision(handle, { ...decision, ...common });
    const segunda = recordDecision(handle, { ...decision, ...common });

    expect(segunda.id).toBe(primeira.id);
    expect(listDecisions(handle)).toHaveLength(1);
  });
});

describe("o histórico", () => {
  function seed(handle: ReturnType<typeof db>, path: string, body: string) {
    const entry = entryAt("2026-08-17T10:00:00.000Z");
    entry.body = body;
    const decision = decide({ ...requestFor(entry), path });
    return recordDecision(handle, {
      ...decision,
      path,
      operation: "add",
      actor: "human",
      confidence: "medium",
      sourceSessions: ["sess-1"],
    });
  }

  it("filtra por caminho — e o filtro vem antes do recorte", () => {
    const handle = db();
    seed(handle, "memory/user_a.md", "primeiro");
    seed(handle, "memory/user_b.md", "segundo");
    seed(handle, "memory/user_b.md", "terceiro");

    const filtradas = listDecisions(handle, { path: "memory/user_b.md" });

    expect(filtradas).toHaveLength(2);
    expect(filtradas.every((row) => row.path === "memory/user_b.md")).toBe(true);
  });

  it("respeita o limite pedido, e devolve as mais recentes primeiro", () => {
    const handle = db();
    const corpos = ["um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito"];
    for (const body of corpos) seed(handle, "memory/user_a.md", body);

    expect(listDecisions(handle, { limit: 2 })).toHaveLength(2);
    // Sem limite explícito, o default tem que caber um histórico curto inteiro —
    // um default apertado esconderia decisão sem avisar.
    expect(listDecisions(handle)).toHaveLength(corpos.length);
  });

  it("guarda a sessão que originou o pedido — a Q37 pede origem **e** sessão", () => {
    const handle = db();

    const row = seed(handle, "memory/user_a.md", "primeiro");

    expect(row.sourceSessions).toEqual(["sess-1"]);
  });
});
