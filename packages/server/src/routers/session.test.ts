import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, CLAUDE_ADAPTER } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import { session } from "../db/schema.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";
import { cleanupGitFixtures, createRepo, tempDir } from "../testing/git-fixtures.js";

let context: TestCaller;

/** A cópia gerenciada do adaptador, que desde 2026-09-08 é a única que o daemon lança. */
function stageManagedAdapter(state: string): string {
  const bin = join(state, ADAPTERS_DIR_NAME, CLAUDE_ADAPTER.id, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  const managed = join(bin, CLAUDE_ADAPTER.command);
  writeFileSync(managed, "#!/bin/sh\ncat\n");
  chmodSync(managed, 0o755);
  return managed;
}

/** A directory holding one executable, to stand in for an installed agent CLI. */
function fakeAgentBin(name = "fake-agent"): { dir: string; command: string } {
  const dir = tempDir("lumem-bin-");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, "#!/bin/sh\ncat\n");
  chmodSync(file, 0o755);
  return { dir, command: file };
}

async function setup(): Promise<{
  ctx: TestCaller;
  projectId: string;
  worktreeId: string;
  worktreePath: string;
  repo: string;
}> {
  context = createTestCaller({ LUMEM_STATE_DIR: tempDir("lumem-state-"), SHELL: "/bin/sh" });
  const workspace = await context.api.workspace.create({ name: "pessoal" });
  const repo = await createRepo({ branch: "main" });
  const project = await context.api.project.add({
    workspaceId: workspace.id,
    path: repo,
    name: "lorebase",
  });
  const worktree = await context.api.worktree.create({ projectId: project.id, name: "teste" });
  return {
    ctx: context,
    projectId: project.id,
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    repo,
  };
}

afterEach(async () => {
  await context?.cleanup();
  cleanupGitFixtures();
});

describe("session.createShell", () => {
  it("runs in the worktree's directory", async () => {
    // F5.1.
    const { ctx, worktreeId, worktreePath } = await setup();

    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(created).toMatchObject({
      kind: "shell",
      scopeType: "worktree",
      scopeId: worktreeId,
      cwd: worktreePath,
      state: "running",
      agentConfigId: null,
    });
  });

  it("runs in the project's directory when that is the scope", async () => {
    const { ctx, projectId, repo } = await setup();

    const created = await ctx.api.session.createShell({
      scopeType: "project",
      scopeId: projectId,
    });

    expect(created.cwd).toBe(repo);
  });

  it("launches the user's login shell", async () => {
    // F5.5. Without their profile the session has none of their aliases.
    const { ctx, projectId } = await setup();

    const created = await ctx.api.session.createShell({
      scopeType: "project",
      scopeId: projectId,
    });

    expect(created.command).toBe("/bin/sh");
  });

  it("supports several sessions in the same scope at once", async () => {
    // F5.4.
    const { ctx, worktreeId } = await setup();

    const first = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    const second = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(first.id).not.toBe(second.id);
    expect(ctx.ptyManager.get(first.id)?.state).toBe("running");
    expect(ctx.ptyManager.get(second.id)?.state).toBe("running");
  });

  it("reports a scope that does not exist", async () => {
    const { ctx } = await setup();

    await expect(
      ctx.api.session.createShell({ scopeType: "worktree", scopeId: "ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ctx.api.session.createShell({ scopeType: "project", scopeId: "ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a worktree that is no longer on disk", async () => {
    // node-pty would answer a missing cwd with a terminal that exits 1 in
    // silence, which reads as a crash rather than as a missing directory.
    const { ctx, worktreeId, worktreePath } = await setup();
    rmSync(worktreePath, { recursive: true, force: true });
    // What a daemon restart would do: the registration becomes `missing`.
    const { reconcileWorktrees } = await import("../boot/reconcile.js");
    await reconcileWorktrees({ db: ctx.db });

    await expect(
      ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId }),
    ).rejects.toThrow(/não está no disco/);
  });
});

describe("session.createAgent", () => {
  it("launches the configured command in a worktree", async () => {
    const { ctx, worktreeId, worktreePath } = await setup();
    const { command } = fakeAgentBin();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "fixture",
      command,
    });

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    expect(created).toMatchObject({
      kind: "agent",
      agentConfigId: config.id,
      agentName: "fixture",
      command,
      cwd: worktreePath,
      state: "running",
    });
  });

  it("accepts a project as the scope", async () => {
    // F5.2 and decision WS-Q15: asking an agent about the repository does not
    // need a branch.
    const { ctx, projectId, repo } = await setup();
    const { command } = fakeAgentBin();
    const config = await createAgentConfigRepository(ctx.db).create({ name: "fixture", command });

    const created = await ctx.api.session.createAgent({
      scopeType: "project",
      scopeId: projectId,
      agentConfigId: config.id,
    });

    expect(created.cwd).toBe(repo);
  });

  it("refuses a configuration whose command is not installed", async () => {
    // F6.5, before the spawn. Afterwards is indistinguishable from a crash.
    const { ctx, worktreeId } = await setup();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "ausente",
      command: "definitely-not-a-real-binary-xyz",
    });

    const failure = ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    await expect(failure).rejects.toThrow(/não está no PATH do servidor/);
    expect(await ctx.api.session.listByScope({ scopeType: "worktree", scopeId: worktreeId })).toEqual(
      [],
    );
  });

  it("passes the configuration's environment to the process", async () => {
    // F5.5: the daemon's environment plus what the configuration declares.
    const { ctx, worktreeId } = await setup();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "echoer",
      command: "/bin/sh",
      args: ["-c", "echo agente=$LUMEM_AGENT_MARKER; sleep 30"],
      env: { LUMEM_AGENT_MARKER: "presente" },
    });

    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    await vi.waitFor(
      () => expect(ctx.ptyManager.snapshot(created.id)).toContain("agente=presente"),
      { timeout: 10_000 },
    );
  });

  it("reports a configuration that does not exist", async () => {
    const { ctx, worktreeId } = await setup();

    await expect(
      ctx.api.session.createAgent({
        scopeType: "worktree",
        scopeId: worktreeId,
        agentConfigId: "ghost",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("lança a cópia gerenciada, e não o caminho absoluto gravado na linha", async () => {
    /*
     * O caso desta máquina, em 2026-09-08: a linha de `agent_config` guardava
     * `/…/nvm/…/bin/claude-agent-acp` — o `0.40.0` global, resolvido em 2026-08-30
     * — enquanto o pino dizia `0.75.1`. O router de `agentConfig` não tem `update`,
     * então nenhuma instalação gerenciada correta a desalojaria.
     *
     * A asserção é sobre **o que o spawner recebeu**, e não sobre o arquivo existir:
     * "o binário está no lugar" era exatamente o que ficava verde enquanto o
     * processo que respondia era outro. [ADR de
     * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
     */
    const state = tempDir("lumem-state-");
    const managed = stageManagedAdapter(state);
    const fake = fakeAgentProcess();
    const spawner = vi.fn(() => fake.process);
    const acpManager = new AcpManager({ spawner, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: state, SHELL: "/bin/sh" }, { acpManager });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const repo = await createRepo({ branch: "main" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: repo,
      name: "lorebase",
    });
    const config = await createAgentConfigRepository(context.db).create({
      name: CLAUDE_ADAPTER.id,
      command: "/Users/eu/.nvm/versions/node/v22.17.1/bin/claude-agent-acp",
      transport: "acp",
      adapterVersion: "0.40.0",
    });

    await context.api.session.createAgent({
      scopeType: "project",
      scopeId: project.id,
      agentConfigId: config.id,
    });

    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ command: managed }));
  });
});

describe("session.listByScope and getDetail", () => {
  it("lists only that scope's sessions", async () => {
    const { ctx, projectId, worktreeId } = await setup();
    const inWorktree = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    await ctx.api.session.createShell({ scopeType: "project", scopeId: projectId });

    const listed = await ctx.api.session.listByScope({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(listed.map((row) => row.id)).toEqual([inWorktree.id]);
  });

  it("reports kind, scope, command and state", async () => {
    // F5.10.
    const { ctx, worktreeId } = await setup();
    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    expect(await ctx.api.session.getDetail({ id: created.id })).toMatchObject({
      kind: "shell",
      scopeType: "worktree",
      scopeId: worktreeId,
      command: "/bin/sh",
      state: "running",
    });
  });

  it("reports a session that does not exist", async () => {
    const { ctx } = await setup();

    await expect(ctx.api.session.getDetail({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("session.resume", () => {
  /**
   * The happy path needs an adapter, so it lives in the e2e (`acp-resume.spec.ts`).
   * What belongs here is the endpoint existing, the two refusals that never reach a
   * process, and — since 2026-09-08 — **which** adapter a resume launches.
   *
   * The sentence that used to be here said *"this caller has no `AcpManager` at
   * all"*. It was true and it was the reason no test could reach the ACP branch of
   * `createAgent` or `resume`; the harness now wires one, the same way `bootstrap`
   * does.
   */

  it("relança o adaptador de hoje, não o caminho congelado na sessão morta", async () => {
    /*
     * O comentário do próprio `resume` já dizia que *"como o adaptador é invocado
     * hoje é configuração"* — e ele relançava `row.command`, o caminho absoluto
     * gravado quando a sessão nasceu. Retomar uma conversa de antes de uma subida
     * de pino relançava a versão velha. [ADR de
     * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
     */
    const state = tempDir("lumem-state-");
    const managed = stageManagedAdapter(state);
    // Um processo falso **por spawn**: um só tem o stdout travado no segundo
    // `launch`, e retomar é sempre um segundo launch.
    const spawner = vi.fn(() => fakeAgentProcess().process);
    const acpManager = new AcpManager({ spawner, isAvailable: () => true });
    context = createTestCaller({ LUMEM_STATE_DIR: state, SHELL: "/bin/sh" }, { acpManager });
    const workspace = await context.api.workspace.create({ name: "pessoal" });
    const repo = await createRepo({ branch: "main" });
    const project = await context.api.project.add({
      workspaceId: workspace.id,
      path: repo,
      name: "lorebase",
    });
    const config = await createAgentConfigRepository(context.db).create({
      name: CLAUDE_ADAPTER.id,
      command: managed,
      transport: "acp",
      adapterVersion: CLAUDE_ADAPTER.pinnedVersion,
    });
    const created = await context.api.session.createAgent({
      scopeType: "project",
      scopeId: project.id,
      agentConfigId: config.id,
    });
    await context.api.session.close({ id: created.id });
    await vi.waitFor(async () =>
      expect((await context.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );
    // Uma sessão nascida antes desta feature: o caminho de uma cópia global que a
    // instalação gerenciada não desaloja.
    const stale = "/Users/eu/.nvm/versions/node/v22.17.1/bin/claude-agent-acp";
    await context.db
      .update(session)
      .set({ command: stale })
      .where(eq(session.id, created.id));
    spawner.mockClear();

    await context.api.session.resume({ id: created.id });

    expect(spawner).toHaveBeenCalledWith(expect.objectContaining({ command: managed }));
    expect(spawner).not.toHaveBeenCalledWith(expect.objectContaining({ command: stale }));
  });

  it("refuses a session that does not exist", async () => {
    const { ctx } = await setup();

    await expect(ctx.api.session.resume({ id: "nao-existe" })).rejects.toMatchObject({
      message: /não existe/,
    });
  });

  it("refuses a shell, because a shell has no conversation", async () => {
    const { ctx, worktreeId } = await setup();
    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    await ctx.api.session.close({ id: created.id });
    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );

    await expect(ctx.api.session.resume({ id: created.id })).rejects.toMatchObject({
      message: /só conversa ACP/,
    });
  });
});

describe("session.close", () => {
  it("ends the process and the record follows", async () => {
    // F5.8.
    const { ctx, worktreeId } = await setup();
    const created = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });

    await ctx.api.session.close({ id: created.id });

    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );
  });

  it("keeps a finished session listed, with its buffer still readable", async () => {
    // F5.9: it goes quiet, it does not disappear.
    const { ctx, worktreeId } = await setup();
    const config = await createAgentConfigRepository(ctx.db).create({
      name: "curto",
      command: "/bin/sh",
      args: ["-c", "echo ultimas-palavras"],
    });
    const created = await ctx.api.session.createAgent({
      scopeType: "worktree",
      scopeId: worktreeId,
      agentConfigId: config.id,
    });

    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: created.id })).state).toBe("exited"),
    );
    expect(ctx.ptyManager.snapshot(created.id)).toContain("ultimas-palavras");
    expect(
      await ctx.api.session.listByScope({ scopeType: "worktree", scopeId: worktreeId }),
    ).toHaveLength(1);
  });

  it("reports a session that does not exist", async () => {
    const { ctx } = await setup();

    await expect(ctx.api.session.close({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("agentConfig.list", () => {
  it("reports whether each command can actually be launched", async () => {
    // F6.5: the menu has to show the unavailable one as unavailable rather
    // than letting the user pick it and watch it die.
    const { ctx } = await setup();
    const { command } = fakeAgentBin();
    const configs = createAgentConfigRepository(ctx.db);
    await configs.create({ name: "instalado", command });
    await configs.create({ name: "ausente", command: "definitely-not-a-real-binary-xyz" });

    const listed = await ctx.api.agentConfig.list();

    expect(listed.find((row) => row.name === "instalado")?.available).toBe(true);
    expect(listed.find((row) => row.name === "ausente")?.available).toBe(false);
  });
});

describe("removal blocked by live sessions", () => {
  it("blocks removing a worktree that still has a session, with the count", async () => {
    // F4.9. There is no force past this: a live process has to be closed, not
    // overridden, or §6's "no session orphaned from its scope" breaks.
    const { ctx, worktreeId } = await setup();
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    const failure = ctx.api.worktree.remove({ id: worktreeId });

    await expect(failure).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(failure).rejects.toThrow(/2 sessão\(ões\) rodando/);
  });

  it("blocks it even with force", async () => {
    const { ctx, worktreeId } = await setup();
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    await expect(
      ctx.api.worktree.remove({ id: worktreeId, force: true }),
    ).rejects.toThrow(/sessão\(ões\) rodando/);
  });

  it("names the live session rather than the dirt when both are true", async () => {
    // PRD §5: the refusal says which of the two it is. Sessions first, because
    // that is the one the user has to act on before anything else can happen.
    const { ctx, worktreeId, worktreePath } = await setup();
    writeFileSync(join(worktreePath, "sujo.txt"), "x");
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    await expect(ctx.api.worktree.remove({ id: worktreeId })).rejects.toThrow(
      /sessão\(ões\) rodando/,
    );
  });

  it("lets the removal through once the sessions are closed", async () => {
    const { ctx, worktreeId } = await setup();
    const session = await ctx.api.session.createShell({
      scopeType: "worktree",
      scopeId: worktreeId,
    });
    await ctx.api.session.close({ id: session.id });
    await vi.waitFor(async () =>
      expect((await ctx.api.session.getDetail({ id: session.id })).state).toBe("exited"),
    );

    // An exited session must not block: it would block forever, since there is
    // nothing left to close.
    await expect(ctx.api.worktree.remove({ id: worktreeId })).resolves.toEqual({ ok: true });
  });

  it("blocks removing a project that still has a session", async () => {
    const { ctx, projectId, worktreeId } = await setup();
    await ctx.api.worktree.remove({ id: worktreeId });
    await ctx.api.session.createShell({ scopeType: "project", scopeId: projectId });

    await expect(ctx.api.project.remove({ id: projectId })).rejects.toThrow(
      /1 sessão\(ões\) rodando/,
    );
  });

  it("blocks removing a project when one of its worktrees has a running session", async () => {
    // §6 extended to the cascade (F2.5, WS-Q22): removing a project takes its
    // worktrees with it, so a live session in any of them is a scope about to
    // vanish, and blocks the removal exactly as the project's own would.
    const { ctx, projectId, worktreeId } = await setup();
    await ctx.api.session.createShell({ scopeType: "worktree", scopeId: worktreeId });

    await expect(ctx.api.project.remove({ id: projectId })).rejects.toThrow(
      /1 sessão\(ões\) rodando/,
    );
  });
});
