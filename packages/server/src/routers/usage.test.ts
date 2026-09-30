import type Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { newId } from "@lumem/shared";

import { sessionUsage } from "../db/schema.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";

/**
 * O router do consumo, pelas duas perguntas que a tela faz.
 *
 * O que só aqui se prova: que a **janela é resolvida no daemon**. O cliente manda
 * o nome; se ele pudesse mandar a data, duas telas abertas em momentos diferentes
 * dariam respostas diferentes para "últimos 7 dias".
 */

const callers: TestCaller[] = [];

afterEach(async () => {
  for (const caller of callers.splice(0)) await caller.cleanup();
  cleanupGitFixtures();
});

/** Um caller com estado próprio — nunca o `~/.lumem` de quem roda a suíte. */
function fresh(): TestCaller {
  const caller = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-") });
  callers.push(caller);
  return caller;
}

describe("usage.byProject", () => {
  it("a janela é um nome, e o corte é feito aqui", async () => {
    const caller = fresh();
    const workspace = await caller.api.workspace.create({ name: "pessoal" });

    // Sem projeto nenhum: a resposta é uma lista vazia, e não um erro.
    await expect(
      caller.api.usage.byProject({ workspaceId: workspace.id, period: "7d" }),
    ).resolves.toEqual([]);
  });

  it("recusa uma janela que não existe", async () => {
    const caller = fresh();
    const workspace = await caller.api.workspace.create({ name: "pessoal" });

    await expect(
      // @ts-expect-error -- é o valor que o enum não permite, e ele chega de fora
      caller.api.usage.byProject({ workspaceId: workspace.id, period: "3h" }),
    ).rejects.toThrow();
  });

  it("soma o que foi gravado, e o default é sete dias", async () => {
    const caller = fresh();
    const workspace = await caller.api.workspace.create({ name: "pessoal" });
    const project = await caller.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "api",
    });

    const spend = (tokens: number, daysAgo: number) => {
      const at = new Date(Date.now() - daysAgo * 86_400_000);
      caller.db
        .insert(sessionUsage)
        .values({
          id: newId(),
          sessionId: `ses-${newId()}`,
          projectId: project.id,
          tokens,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    };
    spend(10_000, 1);
    spend(4_000, 40);

    const week = await caller.api.usage.byProject({ workspaceId: workspace.id });
    const half = await caller.api.usage.byProject({ workspaceId: workspace.id, period: "6m" });

    expect(week[0]).toMatchObject({ name: "api", tokens: 10_000, turns: 1 });
    expect(half[0]).toMatchObject({ tokens: 14_000, turns: 2 });
  });
});

describe("usage.byWorktree", () => {
  it("as worktrees e o que rodou fora delas vêm na mesma resposta", async () => {
    /*
     * Juntas porque só fazem sentido juntas: a soma das worktrees não fecha com o
     * total do projeto, e a diferença é exatamente o `outside`.
     */
    const caller = fresh();
    const workspace = await caller.api.workspace.create({ name: "pessoal" });
    const project = await caller.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "api",
    });

    const result = await caller.api.usage.byWorktree({ projectId: project.id });

    expect(result).toEqual({
      worktrees: [],
      outside: { tokens: 0, cost: null, currency: null, turns: 0 },
    });
  });
});

describe("usage.total", () => {
  /** Uma linha de consumo com o corpo que o teste quer, e o resto no padrão. */
  const spend = (
    caller: TestCaller,
    row: { projectId: string; tokens: number; cost: number | null; turn: number; daysAgo?: number },
  ) => {
    const at = new Date(Date.now() - (row.daysAgo ?? 0) * 86_400_000);
    caller.db
      .insert(sessionUsage)
      .values({
        id: newId(),
        sessionId: `ses-${row.projectId}`,
        projectId: row.projectId,
        tokens: row.tokens,
        cost: row.cost,
        currency: row.cost === null ? null : "USD",
        turn: row.turn,
        createdAt: at,
        updatedAt: at,
      })
      .run();
  };

  it("total sums every workspace in the window", async () => {
    const caller = fresh();
    const projects: string[] = [];
    for (const name of ["a", "b", "c"]) {
      const workspace = await caller.api.workspace.create({ name });
      const project = await caller.api.project.add({
        workspaceId: workspace.id,
        path: await createRepo({ branch: "main" }),
        name: `api-${name}`,
      });
      projects.push(project.id);
    }
    const [a, b, c] = projects as [string, string, string];
    spend(caller, { projectId: a, tokens: 1_000, cost: 0.25, turn: 1 });
    spend(caller, { projectId: b, tokens: 2_000, cost: 0.5, turn: 1 });
    spend(caller, { projectId: b, tokens: 500, cost: null, turn: 2 });
    spend(caller, { projectId: c, tokens: 4_000, cost: 1, turn: 1 });
    // Fora da janela de um dia: só a de sete dias a alcança.
    spend(caller, { projectId: c, tokens: 9_000, cost: 5, turn: 2, daysAgo: 3 });

    const today = await caller.api.usage.total({ period: "1d" });
    const week = await caller.api.usage.total({ period: "7d" });

    // `cost` soma só os não nulos: 0,25 + 0,5 + 1.
    expect(today).toEqual({ tokens: 7_500, cost: 1.75, currency: "USD", turns: 4 });
    expect(week).toEqual({ tokens: 16_500, cost: 6.75, currency: "USD", turns: 5 });
  });

  it("total answers null cost only when every row's cost is null", async () => {
    const caller = fresh();
    const workspace = await caller.api.workspace.create({ name: "pessoal" });
    const project = await caller.api.project.add({
      workspaceId: workspace.id,
      path: await createRepo({ branch: "main" }),
      name: "api",
    });
    spend(caller, { projectId: project.id, tokens: 300, cost: null, turn: 1 });
    spend(caller, { projectId: project.id, tokens: 200, cost: null, turn: 2 });

    await expect(caller.api.usage.total({ period: "1d" })).resolves.toEqual({
      tokens: 500,
      cost: null,
      currency: null,
      turns: 2,
    });
    // Sem nenhuma linha na janela: zero de tudo, e o custo ainda é "ninguém disse".
    const empty = fresh();
    await expect(empty.api.usage.total({ period: "1d" })).resolves.toEqual({
      tokens: 0,
      cost: null,
      currency: null,
      turns: 0,
    });
  });

  it("total runs one statement whatever the workspace count", async () => {
    // Uma consulta por workspace multiplicaria a cota por N (`testing.md`): o que
    // se conta é o que o SQLite recebeu, e não o que o router diz que fez.
    const counts: number[] = [];
    for (const workspaces of [1, 3, 10]) {
      const caller = fresh();
      for (let index = 0; index < workspaces; index += 1) {
        const workspace = await caller.api.workspace.create({ name: `w${String(index)}` });
        const project = await caller.api.project.add({
          workspaceId: workspace.id,
          path: await createRepo({ branch: "main" }),
          name: `p${String(index)}`,
        });
        spend(caller, { projectId: project.id, tokens: 100, cost: 0.1, turn: 1 });
      }

      // O drizzle guarda o handle do SQLite em `$client`; o `Db` do daemon não o tipa.
      const sqlite = (caller.db as unknown as { $client: Database.Database }).$client;
      const prepare = vi.spyOn(sqlite, "prepare");
      const total = await caller.api.usage.total({ period: "7d" });
      counts.push(prepare.mock.calls.length);
      prepare.mockRestore();

      expect(total.tokens).toBe(100 * workspaces);
    }

    expect(counts).toEqual([1, 1, 1]);
  });

  it("total refuses an unknown period", async () => {
    const caller = fresh();

    await expect(
      // @ts-expect-error -- o valor que o enum não permite, e que chega de fora
      caller.api.usage.total({ period: "3h" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
