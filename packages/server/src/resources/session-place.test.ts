import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { session as sessionTable } from "../db/schema.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";
import { agentTitle, liveSessions, sessionPlace } from "./session-place.js";

/**
 * Como a sessão se chama no painel (`038`, C50 e C87), nos casos em que o banco não sabe
 * tudo: a worktree que já não existe, a sessão sem configuração de agente, o agente que o
 * catálogo não conhece.
 */

let caller: TestCaller | undefined;

afterEach(async () => {
  await caller?.cleanup();
  caller = undefined;
  cleanupGitFixtures();
});

async function shellInWorktree() {
  caller = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-"), SHELL: "/bin/sh" });
  const workspace = await caller.api.workspace.create({ name: "pessoal" });
  const project = await caller.api.project.add({
    workspaceId: workspace.id,
    path: await createRepo({ branch: "main" }),
    name: "lumem-os",
  });
  const tree = await caller.api.worktree.create({ projectId: project.id, name: "bandung" });
  const shell = await caller.api.session.createShell({ scopeType: "worktree", scopeId: tree.id });
  return { ctx: caller, shell };
}

describe("agentTitle", () => {
  it("names the agent by its catalog id, and says Agente when nobody can tell", () => {
    expect(agentTitle("claude")).toBe("Claude");
    expect(agentTitle("codex")).toBe("Codex");
    // Fora do catálogo: o nome que a configuração deu, com inicial maiúscula.
    expect(agentTitle("meu-agente")).toBe("Meu-agente");
    expect(agentTitle(null)).toBe("Agente");
  });
});

describe("sessionPlace and liveSessions", () => {
  it("has no checkout for a session whose worktree is gone, and no place for one that is not stored", async () => {
    const { ctx, shell } = await shellInWorktree();
    expect(sessionPlace(ctx.db, shell.id)).toMatchObject({ checkout: "lumem-os/bandung" });

    // A worktree saiu do banco (`scope_id` é polimórfico, sem foreign key): a sessão segue, sem onde.
    ctx.db.update(sessionTable).set({ scopeId: "worktree-que-sumiu" }).where(eq(sessionTable.id, shell.id)).run();
    expect(sessionPlace(ctx.db, shell.id)).toMatchObject({ checkout: null });
    expect(sessionPlace(ctx.db, "nunca-existiu")).toBeNull();

    // O mesmo para o projeto que sumiu: a sessão de escopo `project` fica sem onde, e não falha.
    ctx.db.update(sessionTable).set({ scopeType: "project", scopeId: "projeto-que-sumiu" }).where(eq(sessionTable.id, shell.id)).run();
    expect(sessionPlace(ctx.db, shell.id)).toMatchObject({ checkout: null });
  });

  it("labels a turn from a session with no agent configuration as Agente, with or without a checkout", async () => {
    const { ctx, shell } = await shellInWorktree();
    const turns = (sessionId: string) => ({ liveTurns: () => [{ sessionId, startedAt: new Date(1_000) }] });

    // Um shell não tem configuração de agente: o título é `Agente`, e o checkout vem do banco.
    expect(liveSessions(ctx.db, turns(shell.id)).turns).toEqual([
      { sessionId: shell.id, label: "Agente · lumem-os/bandung", startedAt: "1970-01-01T00:00:01.000Z" },
    ]);

    // Sem linha nenhuma: só o título.
    expect(liveSessions(ctx.db, turns("nunca-existiu")).turns[0]?.label).toBe("Agente");

    // Com a worktree que sumiu: também só o título.
    ctx.db.update(sessionTable).set({ scopeId: "worktree-que-sumiu" }).where(eq(sessionTable.id, shell.id)).run();
    expect(liveSessions(ctx.db, turns(shell.id)).turns[0]?.label).toBe("Agente");
  });
});
