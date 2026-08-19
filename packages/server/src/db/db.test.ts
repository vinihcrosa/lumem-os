import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { newId } from "@lumem/shared";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type Db, type Database_ } from "./index.js";
import { agentConfig, project, session, workspace, worktree } from "./schema.js";

const open: Database_[] = [];
const dirs: string[] = [];

/** A database of its own per test — the parallel-safety the matrix promises. */
function freshDatabase(): { db: Db; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "lumem-db-"));
  dirs.push(dir);
  const path = join(dir, "lumem.db");
  const handle = openDatabase({ path });
  open.push(handle);
  return { db: handle.db, path };
}

afterEach(() => {
  for (const handle of open.splice(0)) handle.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function seedWorkspace(db: Db, name = "pessoal"): Promise<string> {
  const id = newId();
  await db.insert(workspace).values({ id, name });
  return id;
}

async function seedProject(db: Db, workspaceId: string, overrides: Partial<{ name: string; path: string }> = {}) {
  const id = newId();
  await db.insert(project).values({
    id,
    workspaceId,
    name: overrides.name ?? "lorebase",
    path: overrides.path ?? `/repos/${id}`,
    defaultBranch: "main",
  });
  return id;
}

describe("migration", () => {
  it("creates every table the model needs", async () => {
    const { db } = freshDatabase();

    const tables = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );

    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining(["agent_config", "project", "session", "workspace", "worktree"]),
    );
  });

  it("is idempotent across restarts", async () => {
    const { path } = freshDatabase();
    const workspaceId = await seedWorkspace(open[0]!.db);

    // Reopening is what every daemon start does.
    const reopened = openDatabase({ path });
    open.push(reopened);

    expect(await reopened.db.select().from(workspace)).toHaveLength(1);
    expect((await reopened.db.select().from(workspace))[0]?.id).toBe(workspaceId);
  });

  it("stamps rows with a creation time", async () => {
    const { db } = freshDatabase();
    const before = Date.now();

    await seedWorkspace(db);

    const [row] = await db.select().from(workspace);
    expect(row?.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });
});

describe("uniqueness", () => {
  it("refuses two workspaces with the same name", async () => {
    const { db } = freshDatabase();
    await seedWorkspace(db, "pessoal");

    await expect(seedWorkspace(db, "pessoal")).rejects.toThrow(/UNIQUE/i);
  });

  it("refuses the same repository path in two workspaces", async () => {
    // The path is what identifies a repo on disk; registering it twice would
    // give one repository two sets of worktrees.
    const { db } = freshDatabase();
    const a = await seedWorkspace(db, "a");
    const b = await seedWorkspace(db, "b");
    await seedProject(db, a, { path: "/repos/lorebase" });

    await expect(seedProject(db, b, { path: "/repos/lorebase" })).rejects.toThrow(/UNIQUE/i);
  });

  it("refuses two projects with the same name in one workspace", async () => {
    const { db } = freshDatabase();
    const workspaceId = await seedWorkspace(db);
    await seedProject(db, workspaceId, { name: "lorebase", path: "/repos/one" });

    await expect(
      seedProject(db, workspaceId, { name: "lorebase", path: "/repos/two" }),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("allows the same project name in different workspaces", async () => {
    const { db } = freshDatabase();
    const a = await seedWorkspace(db, "a");
    const b = await seedWorkspace(db, "b");
    await seedProject(db, a, { name: "lorebase", path: "/repos/one" });

    await expect(
      seedProject(db, b, { name: "lorebase", path: "/repos/two" }),
    ).resolves.toBeDefined();
  });

  it("refuses two worktrees with the same name in one project", async () => {
    const { db } = freshDatabase();
    const projectId = await seedProject(db, await seedWorkspace(db));
    const values = { projectId, name: "teste", branch: "teste", path: "/w/teste" };
    await db.insert(worktree).values({ id: newId(), ...values });

    await expect(
      db.insert(worktree).values({ id: newId(), ...values, path: "/w/other" }),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("refuses two agent configs with the same name", async () => {
    const { db } = freshDatabase();
    await db.insert(agentConfig).values({ id: newId(), name: "claude-code", command: "claude" });

    await expect(
      db.insert(agentConfig).values({ id: newId(), name: "claude-code", command: "other" }),
    ).rejects.toThrow(/UNIQUE/i);
  });
});

describe("referential integrity", () => {
  it("refuses to delete a workspace that still has projects", async () => {
    // The PRD forbids cascading deletes. Enforced by the database, because a
    // rule that lives only in a procedure is one the next procedure forgets.
    const { db } = freshDatabase();
    const workspaceId = await seedWorkspace(db);
    await seedProject(db, workspaceId);

    await expect(db.delete(workspace)).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("refuses to delete a project that still has worktrees", async () => {
    const { db } = freshDatabase();
    const projectId = await seedProject(db, await seedWorkspace(db));
    await db
      .insert(worktree)
      .values({ id: newId(), projectId, name: "t", branch: "t", path: "/w/t" });

    await expect(db.delete(project)).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("refuses a project pointing at a workspace that does not exist", async () => {
    const { db } = freshDatabase();

    await expect(seedProject(db, "no-such-workspace")).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("refuses to delete an agent config still referenced by a session", async () => {
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({ id: configId, name: "claude-code", command: "claude" });
    await db.insert(session).values({
      id: newId(),
      kind: "agent",
      agentConfigId: configId,
      scopeType: "worktree",
      scopeId: "w1",
      cwd: "/w/t",
      command: "claude",
    });

    await expect(db.delete(agentConfig)).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe("transport", () => {
  it("defaults an agent configuration to the transport that already worked", async () => {
    // A11: nothing existing changes behaviour by being migrated. A row written
    // without an opinion is a PTY row, because that is what it was.
    const { db } = freshDatabase();
    await db.insert(agentConfig).values({ id: newId(), name: "zsh-agent", command: "claude" });

    const [row] = await db.select().from(agentConfig);

    expect(row?.transport).toBe("pty");
  });

  it("rejects a transport the daemon has no manager for", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(agentConfig).values({
        id: newId(),
        name: "sse-agent",
        command: "claude",
        transport: "sse",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("refuses an ACP configuration with no pinned adapter version", async () => {
    // F5.5 and A12: an adapter that changes under a running session is the
    // definition of an invisible failure, so `@latest` is not expressible.
    const { db } = freshDatabase();

    await expect(
      db.insert(agentConfig).values({
        id: newId(),
        name: "claude-acp",
        command: "claude-agent-acp",
        transport: "acp",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("accepts an ACP configuration that pins its adapter", async () => {
    const { db } = freshDatabase();
    await db.insert(agentConfig).values({
      id: newId(),
      name: "claude-acp",
      command: "claude-agent-acp",
      transport: "acp",
      adapterVersion: "0.69.0",
    });

    const [row] = await db.select().from(agentConfig);

    expect(row).toMatchObject({ transport: "acp", adapterVersion: "0.69.0" });
  });

  it("refuses a PTY configuration that pins an adapter it will never launch", async () => {
    // A version on a PTY row is a claim about something that does not run, and
    // the next reader would have no way to know it is noise.
    const { db } = freshDatabase();

    await expect(
      db.insert(agentConfig).values({
        id: newId(),
        name: "claude-code",
        command: "claude",
        transport: "pty",
        adapterVersion: "0.69.0",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("defaults a session to PTY and keeps its ACP fields empty", async () => {
    const { db } = freshDatabase();
    await db.insert(session).values({
      id: newId(),
      kind: "shell",
      scopeType: "project",
      scopeId: "p1",
      cwd: "/repo",
      command: "/bin/zsh",
    });

    const [row] = await db.select().from(session);

    expect(row).toMatchObject({ transport: "pty", acpSessionId: null, mode: null, model: null });
  });

  it("refuses an ACP session with no ACP session id", async () => {
    // D1: the row records what the session *is*, and an ACP session without the
    // adapter's own id cannot be reconciled on the next boot.
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({
      id: configId,
      name: "claude-acp",
      command: "claude-agent-acp",
      transport: "acp",
      adapterVersion: "0.69.0",
    });

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "agent",
        agentConfigId: configId,
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "claude-agent-acp",
        transport: "acp",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("refuses a PTY session carrying an ACP session id", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/zsh",
        transport: "pty",
        acpSessionId: "d81b05ee",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("refuses a shell session on ACP", async () => {
    // F1.2: a shell is always a PTY. There is no conversation to have with one.
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/zsh",
        transport: "acp",
        acpSessionId: "d81b05ee",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("accepts an ACP agent session with the adapter's session id", async () => {
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({
      id: configId,
      name: "claude-acp",
      command: "claude-agent-acp",
      transport: "acp",
      adapterVersion: "0.69.0",
    });
    await db.insert(session).values({
      id: newId(),
      kind: "agent",
      agentConfigId: configId,
      scopeType: "worktree",
      scopeId: "w1",
      cwd: "/w/t",
      command: "claude-agent-acp",
      transport: "acp",
      acpSessionId: "d81b05ee",
      mode: "auto",
      model: "opus[1m]",
    });

    const [row] = await db.select().from(session);

    expect(row).toMatchObject({
      transport: "acp",
      acpSessionId: "d81b05ee",
      mode: "auto",
      model: "opus[1m]",
    });
  });
});

describe("state constraints", () => {
  it("rejects a worktree state the code cannot interpret", async () => {
    const { db } = freshDatabase();
    const projectId = await seedProject(db, await seedWorkspace(db));

    await expect(
      db.insert(worktree).values({
        id: newId(),
        projectId,
        name: "t",
        branch: "t",
        path: "/w/t",
        state: "zombie",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects an agent session with no configuration", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "agent",
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "claude",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a shell session that claims an agent configuration", async () => {
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({ id: configId, name: "claude-code", command: "claude" });

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        agentConfigId: configId,
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/zsh",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a scope type that is neither project nor worktree", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "workspace",
        scopeId: "x",
        cwd: "/repo",
        command: "/bin/sh",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a running session that already has an exit code", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
        exitCode: 0,
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("stores agent arguments and environment as structured values", async () => {
    const { db } = freshDatabase();
    await db.insert(agentConfig).values({
      id: newId(),
      name: "claude-code",
      command: "claude",
      args: ["--verbose"],
      env: { ANTHROPIC_LOG: "debug" },
    });

    const [row] = await db.select().from(agentConfig);

    expect(row?.args).toEqual(["--verbose"]);
    expect(row?.env).toEqual({ ANTHROPIC_LOG: "debug" });
  });
});
