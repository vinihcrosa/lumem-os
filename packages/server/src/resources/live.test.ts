import { afterEach, describe, expect, it } from "vitest";

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
});
