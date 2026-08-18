import { afterEach, describe, expect, it } from "vitest";

import { actionSignal } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";

import {
  KILLED_EARLY_SECONDS,
  REVERT_LOG_FORMAT,
  SIGNAL_WINDOW_MS,
  findRevertsIn,
  isKilledEarly,
  listSignals,
  recordRevertSignals,
  recordSignal,
  recordSignalOnce,
  tryRecordSignal,
} from "./signals.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
});

function db(): TestDb {
  const database = openTestDb();
  databases.push(database);
  return database;
}

/** O que o `git log` devolve no formato que a varredura pede, montado à mão. */
function logOf(commits: { sha: string; subject: string; body?: string }[]): string {
  return commits
    .map(({ sha, subject, body = "" }) => `${sha}\u001f${subject}\u001f${body}\u001e`)
    .join("\n");
}

describe("sinais de ação", () => {
  it("registra os quatro tipos", () => {
    const database = db();

    recordSignal(database.db, { kind: "user_edited_after_agent", target: "src/a.ts" });
    recordSignal(database.db, { kind: "user_reverted_agent_commit", target: "abc123" });
    recordSignal(database.db, { kind: "worktree_discarded", target: "feature-x", detail: 1 });
    recordSignal(database.db, { kind: "session_killed_early", target: "s1", detail: 12 });

    expect(listSignals(database.db)).toHaveLength(4);
  });

  it("guarda o alvo, o número e o escopo em que aquilo aconteceu", () => {
    const database = db();

    recordSignal(database.db, {
      kind: "user_edited_after_agent",
      target: "packages/server/src/a.ts",
      projectId: "p1",
      worktreeId: "wt1",
      sessionId: "s1",
      detail: 12,
    });

    const [row] = listSignals(database.db);
    expect(row?.target).toBe("packages/server/src/a.ts");
    expect(row?.detail).toBe(12);
    // O escopo é o que separa "editei no checkout dele" de "editei em outro".
    expect(row?.projectId).toBe("p1");
    expect(row?.worktreeId).toBe("wt1");
    expect(row?.sessionId).toBe("s1");
  });

  it("recusa tipo fora da lista — o schema é a fronteira", () => {
    const database = db();

    expect(() =>
      // @ts-expect-error — é exatamente isso que o CHECK do banco existe para pegar.
      recordSignal(database.db, { kind: "usuario_ficou_bravo", target: "x" }),
    ).toThrow();
  });

  it("filtra por tipo", () => {
    const database = db();
    recordSignal(database.db, { kind: "worktree_discarded", target: "a" });
    recordSignal(database.db, { kind: "worktree_discarded", target: "b" });
    recordSignal(database.db, { kind: "session_killed_early", target: "s1" });

    expect(listSignals(database.db, { kind: "worktree_discarded" })).toHaveLength(2);
  });
});

describe("a privacidade da Q18 é do banco, não de quem chama", () => {
  it("recusa texto em detail, que a afinidade INTEGER do SQLite deixaria passar", () => {
    const database = db();

    expect(() =>
      database.db
        .insert(actionSignal)
        .values({
          id: "x1",
          kind: "user_edited_after_agent",
          target: "src/a.ts",
          // O caminho que existia: INTEGER guarda texto não numérico como TEXT.
          detail: "TODO: pedir aumento; senha hunter2" as unknown as number,
        })
        .run(),
    ).toThrow();
  });

  it("recusa alvo com quebra de linha — alvo é identificador, não trecho de arquivo", () => {
    const database = db();

    expect(() =>
      recordSignal(database.db, {
        kind: "user_edited_after_agent",
        target: "linha um\nlinha dois",
      }),
    ).toThrow();
  });

  it("recusa alvo maior do que qualquer caminho", () => {
    const database = db();

    expect(() =>
      recordSignal(database.db, { kind: "user_edited_after_agent", target: "x".repeat(1_025) }),
    ).toThrow();
  });
});

describe("listSignals", () => {
  /** Datas explícitas: dois `insert` no mesmo milissegundo empatariam. */
  function seed(database: TestDb, count: number): void {
    const base = new Date("2026-08-17T10:00:00Z").getTime();
    for (let index = 0; index < count; index += 1) {
      database.db
        .insert(actionSignal)
        .values({
          id: `sig-${index}`,
          kind: "worktree_discarded",
          target: `wt-${index}`,
          createdAt: new Date(base + index * 1_000),
        })
        .run();
    }
  }

  it("corta no limite e devolve o mais recente primeiro", () => {
    const database = db();
    seed(database, 4);

    const rows = listSignals(database.db, { limit: 3 });

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.target)).toEqual(["wt-3", "wt-2", "wt-1"]);
  });
});

describe("descarte de repetição", () => {
  it("grava uma vez por (tipo, alvo, escopo) dentro da janela", () => {
    const database = db();
    const signal = {
      kind: "user_edited_after_agent" as const,
      target: "src/notes.ts",
      worktreeId: "wt1",
    };

    expect(recordSignalOnce(database.db, signal)).toBe(true);
    expect(recordSignalOnce(database.db, { ...signal, detail: 3 })).toBe(false);
    expect(listSignals(database.db)).toHaveLength(1);
  });

  it("o mesmo arquivo em outro escopo é outro sinal", () => {
    const database = db();
    const signal = { kind: "user_edited_after_agent" as const, target: "src/notes.ts" };

    recordSignalOnce(database.db, { ...signal, worktreeId: "wt1" });
    recordSignalOnce(database.db, { ...signal, worktreeId: "wt2" });

    expect(listSignals(database.db)).toHaveLength(2);
  });

  it("fora da janela o sinal volta a valer", () => {
    const database = db();
    const signal = { kind: "user_edited_after_agent" as const, target: "src/notes.ts" };
    database.db
      .insert(actionSignal)
      .values({
        id: "antigo",
        ...signal,
        createdAt: new Date(Date.now() - SIGNAL_WINDOW_MS - 1_000),
      })
      .run();

    expect(recordSignalOnce(database.db, signal)).toBe(true);
    expect(listSignals(database.db)).toHaveLength(2);
  });

  it("`windowMs: null` grava uma vez e nunca mais, por mais antigo que seja", () => {
    const database = db();
    const signal = { kind: "user_reverted_agent_commit" as const, target: "abc123" };
    database.db
      .insert(actionSignal)
      .values({ id: "antigo", ...signal, createdAt: new Date("2020-01-01T00:00:00Z") })
      .run();

    expect(recordSignalOnce(database.db, signal, null)).toBe(false);
  });
});

describe("tryRecordSignal", () => {
  it("não derruba quem chamou, e conta o que houve", () => {
    const database = db();
    const errors: unknown[] = [];

    const wrote = tryRecordSignal(
      database.db,
      // Alvo com quebra de linha: o CHECK recusa, e mesmo assim nada estoura.
      { kind: "user_edited_after_agent", target: "a\nb" },
      { onError: (error) => errors.push(error) },
    );

    expect(wrote).toBe(false);
    expect(errors).toHaveLength(1);
    expect(listSignals(database.db)).toHaveLength(0);
  });
});

describe("findRevertsIn", () => {
  it("acha o revert e devolve o SHA do que ele desfez", () => {
    const log = logOf([
      {
        sha: "abc123",
        subject: 'Revert "feat: cache agressivo no loader"',
        body: "This reverts commit def4567.\n",
      },
      { sha: "def4567", subject: "feat: cache agressivo no loader" },
      { sha: "ghi789a", subject: "chore: lint" },
    ]);

    const found = findRevertsIn(log);

    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({ sha: "abc123", revertedSha: "def4567" });
  });

  it("não devolve o assunto do commit — texto seu não sai daqui", () => {
    const log = logOf([
      {
        sha: "abc123",
        subject: 'Revert "feat: senha hunter2 no .env"',
        body: "This reverts commit def4567.\n",
      },
    ]);

    expect(Object.keys(findRevertsIn(log)[0] ?? {})).toEqual(["sha", "revertedSha"]);
  });

  it("não confunde commit que só fala sobre revert", () => {
    const log = logOf([{ sha: "abc123", subject: "docs: explica como reverter um commit" }]);

    expect(findRevertsIn(log)).toHaveLength(0);
  });

  it("recusa assunto que contém o formato em vez de ser o formato", () => {
    // Sem as âncoras, `fix: revert "cache" estava errado` casaria — e o sinal
    // passaria a marcar commit que ninguém reverteu.
    const log = logOf([
      {
        sha: "abc123",
        subject: 'fix: revert "cache" estava errado',
        body: "This reverts commit def4567.\n",
      },
    ]);

    expect(findRevertsIn(log)).toHaveLength(0);
  });

  it("ignora revert sem o rastro que o git escreve, porque não há alvo", () => {
    const log = logOf([{ sha: "abc123", subject: 'Revert "feat: cache"', body: "sem rastro\n" }]);

    expect(findRevertsIn(log)).toHaveLength(0);
  });

  it("log vazio não estoura", () => {
    expect(findRevertsIn("")).toEqual([]);
  });

  it("lê o formato que o daemon pede ao git", () => {
    expect(REVERT_LOG_FORMAT).toBe("%H\u001f%s\u001f%b\u001e");
  });
});

describe("recordRevertSignals", () => {
  const log = logOf([
    { sha: "abc123", subject: 'Revert "feat: cache"', body: "This reverts commit def4567.\n" },
  ]);

  it("grava o SHA desfeito, com o escopo da varredura", () => {
    const database = db();

    expect(recordRevertSignals(database.db, log, { worktreeId: "wt1", sessionId: "s1" })).toBe(1);

    const [row] = listSignals(database.db, { kind: "user_reverted_agent_commit" });
    expect(row?.target).toBe("def4567");
    expect(row?.worktreeId).toBe("wt1");
    expect(row?.sessionId).toBe("s1");
  });

  it("reencontrar não é acontecer de novo: a segunda varredura não grava nada", () => {
    const database = db();
    const scope = { worktreeId: "wt1", sessionId: "s1" };

    recordRevertSignals(database.db, log, scope);

    expect(recordRevertSignals(database.db, log, scope)).toBe(0);
    expect(listSignals(database.db)).toHaveLength(1);
  });
});

describe("isKilledEarly", () => {
  function after(seconds: number): { start: Date; end: Date } {
    const start = new Date("2026-08-17T10:00:00Z");
    return { start, end: new Date(start.getTime() + seconds * 1_000) };
  }

  it("abaixo do limite é sinal", () => {
    const { start, end } = after(KILLED_EARLY_SECONDS - 1);
    expect(isKilledEarly(start, end)).toBe(true);
  });

  it("exatamente no limite não é — a fronteira é aberta", () => {
    const { start, end } = after(KILLED_EARLY_SECONDS);
    expect(isKilledEarly(start, end)).toBe(false);
  });

  it("acima do limite não é — a sessão fez alguma coisa", () => {
    const { start, end } = after(KILLED_EARLY_SECONDS + 1);
    expect(isKilledEarly(start, end)).toBe(false);
  });
});
