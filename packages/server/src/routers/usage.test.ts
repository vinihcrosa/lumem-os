import { afterEach, describe, expect, it } from "vitest";

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
