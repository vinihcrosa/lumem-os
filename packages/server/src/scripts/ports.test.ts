import { createServer } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { checkoutPort } from "../db/schema.js";
import {
  DEFAULT_PORT_RANGE,
  PORT_BLOCK_SIZE,
  findReservedPort,
  isPortFree,
  parsePortRange,
  portBlock,
  releasePort,
  reservePort,
} from "./ports.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function db() {
  const database = openTestDb();
  databases.push(database);
  return database.db;
}

/** Tudo livre, para o teste que não está falando sobre disponibilidade. */
const anyFree = async (): Promise<boolean> => true;

describe("reservePort", () => {
  it("aloca na primeira vez e devolve a MESMA porta nas seguintes", async () => {
    // A razão de a reserva ser gravada: a porta entra em `.env`, em proxy e na
    // barra do navegador. Uma que muda a cada start não serve para nada disso.
    const database = db();
    const scope = { scopeType: "worktree", scopeId: "w1" } as const;

    const first = await reservePort(database, scope, { isFree: anyFree });
    const second = await reservePort(database, scope, { isFree: anyFree });

    expect(second).toBe(first);
    expect(await database.select().from(checkoutPort)).toHaveLength(1);
  });

  it("dá blocos diferentes a checkouts diferentes", async () => {
    const database = db();

    const a = await reservePort(database, { scopeType: "worktree", scopeId: "a" }, { isFree: anyFree });
    const b = await reservePort(database, { scopeType: "worktree", scopeId: "b" }, { isFree: anyFree });

    expect(b).toBe(a + PORT_BLOCK_SIZE);
  });

  it("projeto e worktree com o mesmo id são checkouts diferentes", async () => {
    const database = db();

    const project = await reservePort(database, { scopeType: "project", scopeId: "x" }, { isFree: anyFree });
    const worktree = await reservePort(database, { scopeType: "worktree", scopeId: "x" }, { isFree: anyFree });

    expect(worktree).not.toBe(project);
  });

  it("pula o bloco que a máquina não tem livre", async () => {
    const database = db();
    const busy = DEFAULT_PORT_RANGE.from;

    const port = await reservePort(
      database,
      { scopeType: "worktree", scopeId: "w1" },
      { isFree: async (candidate) => candidate !== busy },
    );

    expect(port).toBe(busy + PORT_BLOCK_SIZE);
  });

  it("recusa com motivo quando não há bloco livre na faixa", async () => {
    const database = db();

    await expect(
      reservePort(
        database,
        { scopeType: "worktree", scopeId: "w1" },
        { range: { from: 45_000, to: 45_009 }, isFree: async () => false },
      ),
    ).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("não empresta um bloco já reservado, mesmo que a máquina o diga livre", async () => {
    // A tabela é a fonte: uma porta reservada e não usada continua sendo dela,
    // senão o segundo checkout ganharia a mesma e o problema voltaria inteiro.
    const database = db();
    const first = await reservePort(database, { scopeType: "worktree", scopeId: "a" }, { isFree: anyFree });

    const second = await reservePort(database, { scopeType: "worktree", scopeId: "b" }, { isFree: anyFree });

    expect(second).not.toBe(first);
  });
});

describe("findReservedPort", () => {
  it("não aloca nada — a tela pergunta muito mais do que alguém roda", async () => {
    const database = db();

    expect(await findReservedPort(database, { scopeType: "worktree", scopeId: "w1" })).toBeNull();
    expect(await database.select().from(checkoutPort)).toHaveLength(0);
  });

  it("acha o que a reserva gravou", async () => {
    const database = db();
    const scope = { scopeType: "worktree", scopeId: "w1" } as const;
    const port = await reservePort(database, scope, { isFree: anyFree });

    expect(await findReservedPort(database, scope)).toBe(port);
  });
});

describe("releasePort", () => {
  it("devolve o bloco quando o checkout morre", async () => {
    // Sem isto a faixa vaza: cada worktree criada e removida levaria dez portas.
    const database = db();
    const gone = { scopeType: "worktree", scopeId: "a" } as const;
    const first = await reservePort(database, gone, { isFree: anyFree });

    await releasePort(database, gone);
    const reused = await reservePort(database, { scopeType: "worktree", scopeId: "b" }, { isFree: anyFree });

    expect(reused).toBe(first);
  });
});

describe("portBlock", () => {
  it("é o bloco inteiro, a partir da base", () => {
    expect(portBlock(45_000)).toHaveLength(PORT_BLOCK_SIZE);
    expect(portBlock(45_000)[0]).toBe(45_000);
    expect(portBlock(45_000).at(-1)).toBe(45_000 + PORT_BLOCK_SIZE - 1);
  });
});

describe("isPortFree", () => {
  it("diz não para uma porta que alguém está escutando", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      expect(await isPortFree(port)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("diz sim para uma que ninguém está", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(await isPortFree(port)).toBe(true);
  });
});

describe("parsePortRange", () => {
  it("lê a faixa da variável", () => {
    expect(parsePortRange("50000-50100")).toEqual({ from: 50_000, to: 50_100 });
  });

  it("cai no default para qualquer coisa ilegível, em vez de derrubar o daemon", () => {
    // O mesmo princípio do `readBudget` do config: número torto em variável
    // opcional não pode impedir o daemon de subir.
    for (const raw of [undefined, "", "abc", "50000", "50100-50000", "45000-45005"]) {
      expect(parsePortRange(raw)).toEqual({ ...DEFAULT_PORT_RANGE });
    }
  });
});
