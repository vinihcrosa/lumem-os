import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { session as sessionTable } from "../db/schema.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";
import { createLiveResources } from "./live.js";
import type { ProcessRow } from "./process-table.js";

/**
 * O amostrador ligado ao daemon: o pid é o do shell de verdade que o `PtyManager`
 * abriu, e o rótulo vem do banco (`038`, C47 e C50 de ponta a ponta).
 */

let caller: TestCaller | undefined;

afterEach(async () => {
  await caller?.cleanup();
  caller = undefined;
  cleanupGitFixtures();
});

async function checkout(): Promise<{ ctx: TestCaller; worktreeId: string; projectId: string }> {
  caller = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-"), SHELL: "/bin/sh" });
  const workspace = await caller.api.workspace.create({ name: "pessoal" });
  const project = await caller.api.project.add({
    workspaceId: workspace.id,
    path: await createRepo({ branch: "main" }),
    name: "lumem-os",
  });
  const tree = await caller.api.worktree.create({ projectId: project.id, name: "bandung" });
  return { ctx: caller, worktreeId: tree.id, projectId: project.id };
}

const row = (pid: number, ppid: number, mb: number, command: string): ProcessRow => ({
  pid,
  ppid,
  rssBytes: mb * 1024 * 1024,
  cpuSeconds: 0,
  command,
});

describe("live resources", () => {
  it("names a shell by its worktree and a script by its tab", async () => {
    const { ctx, worktreeId, projectId } = await checkout();
    const shell = await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });
    const atProject = await ctx.api.session.createShell({ scopeType: "project", scopeId: projectId });
    const pids = new Map(ctx.ptyManager.livePids().map((live) => [live.sessionId, live.pid]));
    const shellPid = pids.get(shell.id)!;
    const projectPid = pids.get(atProject.id)!;

    const live = createLiveResources({
      db: ctx.db,
      ptyManager: ctx.ptyManager,
      acpManager: { liveProcesses: () => [] },
      daemonPid: 4_000_000,
      read: async () => [
        row(4_000_000, 1, 200, "/opt/node"),
        row(shellPid, 4_000_000, 30, "/bin/sh"),
        row(projectPid, 4_000_000, 20, "/bin/sh"),
        row(shellPid + 1_000_000, shellPid, 10, "/usr/bin/vim"),
      ],
    });
    const { top, groups } = await live.resources();
    live.stop();

    expect(top.map((entry) => entry.label)).toEqual([
      "node",
      "Terminal · lumem-os/bandung",
      // A sessão de escopo `project` não tem worktree: só o projeto.
      "Terminal · lumem-os",
      "vim",
    ]);
    expect(groups.terminals.rssBytes).toBe(60 * 1024 * 1024);
    expect(groups.daemon.rssBytes).toBe(200 * 1024 * 1024);
  });

  it("names an adapter by its catalog id and its checkout", async () => {
    const { ctx, worktreeId } = await checkout();
    const stored = await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    const live = createLiveResources({
      db: ctx.db,
      ptyManager: { livePids: () => [] },
      // O id da sessão é o do banco: é ele que leva ao projeto e à worktree.
      acpManager: { liveProcesses: () => [{ sessionId: stored.id, pid: 500, adapterId: "claude" }] },
      daemonPid: 100,
      read: async () => [row(100, 1, 50, "/opt/node"), row(500, 100, 300, "/opt/claude-agent-acp")],
    });
    const { top } = await live.resources();
    live.stop();

    expect(top[0]).toMatchObject({ pid: 500, label: "Claude · lumem-os/bandung" });
  });

  it("names a script by its tab, and each adapter by its own catalog id", async () => {
    const { ctx, worktreeId } = await checkout();
    const script = await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });
    ctx.db.update(sessionTable).set({ kind: "script", scriptName: "run" }).where(eq(sessionTable.id, script.id)).run();
    const claude = await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });
    const codex = await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });
    const scriptPid = ctx.ptyManager.livePids().find((live) => live.sessionId === script.id)!.pid;

    const live = createLiveResources({
      db: ctx.db,
      ptyManager: ctx.ptyManager,
      // Dois adaptadores de catálogos diferentes: cada processo leva o título do **seu**.
      acpManager: {
        liveProcesses: () => [
          { sessionId: claude.id, pid: 500, adapterId: "claude" },
          { sessionId: codex.id, pid: 600, adapterId: "codex" },
        ],
      },
      daemonPid: 100,
      read: async () => [
        row(100, 1, 50, "/opt/node"),
        row(500, 100, 300, "/opt/claude-agent-acp"),
        row(600, 100, 200, "/opt/codex-acp"),
        row(scriptPid, 100, 10, "/bin/sh"),
      ],
    });
    const { top } = await live.resources();
    live.stop();

    const labelOf = (pid: number) => top.find((entry) => entry.pid === pid)?.label;
    expect(labelOf(500)).toBe("Claude · lumem-os/bandung");
    expect(labelOf(600)).toBe("Codex · lumem-os/bandung");
    // O script é a aba que a pessoa vê (`Run`), e não `Terminal`.
    expect(labelOf(scriptPid)).toBe("Run · lumem-os/bandung");
  });

  it("falls back to what it can say when the database does not know the session", async () => {
    const { ctx } = await checkout();

    const live = createLiveResources({
      db: ctx.db,
      ptyManager: { livePids: () => [{ sessionId: "sem-linha-de-terminal", pid: 700 }] },
      acpManager: {
        liveProcesses: () => [
          // Sem linha no banco: o agente ainda se chama pelo catálogo, sem checkout.
          { sessionId: "sem-linha-de-agente", pid: 500, adapterId: "claude" },
          // Fora do catálogo: não há como nomear, e o comando é a melhor resposta.
          { sessionId: "sem-catalogo", pid: 600, adapterId: null },
        ],
      },
      daemonPid: 100,
      read: async () => [
        row(100, 1, 50, "/opt/node"),
        row(500, 100, 300, "/opt/claude-agent-acp"),
        row(600, 100, 200, "/opt/outro-acp"),
        row(700, 100, 100, "/bin/zsh"),
      ],
    });
    const { top } = await live.resources();
    live.stop();

    const labelOf = (pid: number) => top.find((entry) => entry.pid === pid)?.label;
    expect(labelOf(500)).toBe("Claude");
    expect(labelOf(600)).toBe("outro-acp");
    // Um terminal que o banco não conhece volta ao nome do comando.
    expect(labelOf(700)).toBe("zsh");
  });

  it("does not fail the sample when a session leaves between listing it and naming it", async () => {
    // `tracked()` e `describe()` leem `liveProcesses()` em instantes diferentes: o agente que
    // saiu no meio não pode derrubar a amostra, e o processo volta ao nome do comando.
    const { ctx } = await checkout();
    let calls = 0;

    const live = createLiveResources({
      db: ctx.db,
      ptyManager: { livePids: () => [] },
      acpManager: {
        liveProcesses: () => (calls++ === 0 ? [{ sessionId: "saiu", pid: 500, adapterId: "claude" }] : []),
      },
      daemonPid: 100,
      read: async () => [row(100, 1, 50, "/opt/node"), row(500, 100, 300, "/opt/claude-agent-acp")],
    });
    const { top } = await live.resources();
    live.stop();

    expect(top.find((entry) => entry.pid === 500)?.label).toBe("claude-agent-acp");
  });
});
