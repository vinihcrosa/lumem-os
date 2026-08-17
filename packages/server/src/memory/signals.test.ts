import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";

import {
  KILLED_EARLY_SECONDS,
  findRevertsIn,
  isKilledEarly,
  listSignals,
  recordSignal,
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

describe("sinais de ação", () => {
  it("registra os quatro tipos", () => {
    const database = db();

    recordSignal(database.db, { kind: "user_edited_after_agent", target: "src/a.ts" });
    recordSignal(database.db, { kind: "user_reverted_agent_commit", target: "abc123" });
    recordSignal(database.db, { kind: "worktree_discarded", target: "feature-x", detail: 1 });
    recordSignal(database.db, { kind: "session_killed_early", target: "s1", detail: 12 });

    expect(listSignals(database.db)).toHaveLength(4);
  });

  it("guarda o alvo e um número, e não tem onde guardar conteúdo", () => {
    const database = db();

    recordSignal(database.db, {
      kind: "user_edited_after_agent",
      target: "packages/server/src/a.ts",
      worktreeId: "wt1",
      detail: 12,
    });

    const [row] = listSignals(database.db);
    // Q18: a privacidade está no schema. Não existe coluna de conteúdo, então
    // não existe caminho para o texto do usuário chegar aqui.
    expect(Object.keys(row ?? {})).not.toContain("content");
    expect(row?.target).toBe("packages/server/src/a.ts");
    expect(row?.detail).toBe(12);
  });

  it("filtra por tipo", () => {
    const database = db();
    recordSignal(database.db, { kind: "worktree_discarded", target: "a" });
    recordSignal(database.db, { kind: "worktree_discarded", target: "b" });
    recordSignal(database.db, { kind: "session_killed_early", target: "s1" });

    expect(listSignals(database.db, { kind: "worktree_discarded" })).toHaveLength(2);
  });

  it("recusa tipo fora da lista — o schema é a fronteira", () => {
    const database = db();

    expect(() =>
      // @ts-expect-error — é exatamente isso que o CHECK do banco existe para pegar.
      recordSignal(database.db, { kind: "usuario_ficou_bravo", target: "x" }),
    ).toThrow();
  });
});

describe("findRevertsIn", () => {
  it("acha o revert e o que ele desfez", () => {
    const log = [
      'abc123 Revert "feat: cache agressivo no loader"',
      "def456 feat: cache agressivo no loader",
      "ghi789 chore: lint",
    ].join("\n");

    const found = findRevertsIn(log);

    expect(found).toHaveLength(1);
    expect(found[0]?.sha).toBe("abc123");
    expect(found[0]?.revertedSubject).toBe("feat: cache agressivo no loader");
  });

  it("não confunde commit que só fala sobre revert", () => {
    const log = "abc123 docs: explica como reverter um commit";

    // Procurar em vez de instrumentar só funciona se o padrão for estrito: o
    // formato é o do `git revert`, e não qualquer menção à palavra.
    expect(findRevertsIn(log)).toHaveLength(0);
  });

  it("log vazio não estoura", () => {
    expect(findRevertsIn("")).toEqual([]);
  });
});

describe("isKilledEarly", () => {
  it("abaixo do limite é sinal", () => {
    const start = new Date("2026-08-17T10:00:00Z");
    const end = new Date(start.getTime() + (KILLED_EARLY_SECONDS - 1) * 1000);

    expect(isKilledEarly(start, end)).toBe(true);
  });

  it("acima do limite não é — a sessão fez alguma coisa", () => {
    const start = new Date("2026-08-17T10:00:00Z");
    const end = new Date(start.getTime() + (KILLED_EARLY_SECONDS + 1) * 1000);

    expect(isKilledEarly(start, end)).toBe(false);
  });
});
