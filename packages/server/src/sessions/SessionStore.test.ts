import { tmpdir } from "node:os";

import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../db/index.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { AcpManager } from "../acp/AcpManager.js";
import { PtyManager } from "../pty/PtyManager.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import { createSessionStore, type SessionStore } from "./SessionStore.js";

const managers: PtyManager[] = [];
const acpManagers: AcpManager[] = [];
const databases: TestDb[] = [];
const unsubscribes: (() => void)[] = [];
/** Processes the shared ACP manager hands out, one per spawn. */
const queued: ReturnType<typeof fakeAgentProcess>["process"][] = [];

function setup(): {
  store: SessionStore;
  db: Db;
  ptyManager: PtyManager;
  acpManager: AcpManager;
} {
  const database = openTestDb();
  databases.push(database);
  const ptyManager = new PtyManager();
  managers.push(ptyManager);
  const acpManager = new AcpManager({
    spawner: () => queued.shift() ?? fakeAgentProcess().process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
  });
  acpManagers.push(acpManager);
  const store = createSessionStore({ db: database.db, ptyManager, acpManager });
  unsubscribes.push(store.trackExits());
  return { store, db: database.db, ptyManager, acpManager };
}

/** An agent configuration and the input that starts a session against it. */
async function acpAgent(db: Db, overrides: Record<string, unknown> = {}) {
  const config = await createAgentConfigRepository(db).create({
    name: `claude-acp-${newId()}`,
    command: "claude-agent-acp",
    transport: "acp",
    adapterVersion: "0.69.0",
  });
  return {
    kind: "agent" as const,
    agentConfigId: config.id,
    scopeType: "worktree" as const,
    scopeId: "w1",
    cwd: tmpdir(),
    command: config.command,
    transport: "acp" as const,
    adapterVersion: config.adapterVersion,
    ...overrides,
  };
}

function shell(overrides: Record<string, unknown> = {}) {
  return {
    kind: "shell" as const,
    scopeType: "project" as const,
    scopeId: "p1",
    cwd: tmpdir(),
    command: "sh",
    args: ["-c", "sleep 30"],
    ...overrides,
  };
}

afterEach(async () => {
  queued.length = 0;
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
  await Promise.all(acpManagers.splice(0).map((manager) => manager.killAll()));
  for (const database of databases.splice(0)) database.cleanup();
});

describe("start", () => {
  it("records the session as running, with what was launched", async () => {
    const { store } = setup();

    const row = await store.start(shell());

    expect(row).toMatchObject({
      kind: "shell",
      scopeType: "project",
      scopeId: "p1",
      command: "sh",
      state: "running",
      exitCode: null,
      agentConfigId: null,
    });
  });

  it("gives the record the process's own id", async () => {
    // One identity for both halves: no mapping table, no way to drift.
    const { store, ptyManager } = setup();

    const row = await store.start(shell());

    expect(ptyManager.get(row.id)?.state).toBe("running");
  });

  it("records an agent session against its configuration", async () => {
    const { store, db } = setup();
    const config = await createAgentConfigRepository(db).create({
      name: "fixture",
      command: "sh",
    });

    const row = await store.start(
      shell({ kind: "agent", agentConfigId: config.id, scopeType: "worktree", scopeId: "wt1" }),
    );

    expect(row).toMatchObject({ kind: "agent", agentConfigId: config.id });
  });

  it("kills the process when the record cannot be written", async () => {
    // A process the daemon cannot describe is one nobody can find or stop from
    // the UI.
    const { store, ptyManager } = setup();

    await expect(
      store.start(shell({ kind: "agent", agentConfigId: "ghost" })),
    ).rejects.toThrow();

    await vi.waitFor(() =>
      expect(ptyManager.list().every((info) => info.state === "exited")).toBe(true),
    );
  });
});

describe("exit tracking", () => {
  it("marks a session that ended on its own as exited, with its code", async () => {
    const { store, db } = setup();
    const row = await store.start(shell({ args: ["-c", "exit 7"] }));

    await vi.waitFor(async () => {
      const stored = await createSessionRepository(db).findById(row.id);
      expect(stored).toMatchObject({ state: "exited", exitCode: 7 });
    });
  });

  it("stops updating once unsubscribed", async () => {
    const { store, db, ptyManager } = setup();
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    const row = await store.start(shell());

    ptyManager.kill(row.id);
    await vi.waitFor(() => expect(ptyManager.get(row.id)?.state).toBe("exited"));

    expect((await createSessionRepository(db).findById(row.id))?.state).toBe("running");
  });

  it("does not rewrite an exit code that was already recorded", async () => {
    // The exit watcher and the boot reconciliation can reach the same row.
    const { store, db } = setup();
    const row = await store.start(shell({ args: ["-c", "exit 3"] }));
    const sessions = createSessionRepository(db);
    await vi.waitFor(async () =>
      expect((await sessions.findById(row.id))?.state).toBe("exited"),
    );

    await sessions.markExited(row.id, 0);

    expect((await sessions.findById(row.id))?.exitCode).toBe(3);
  });
});

describe("close", () => {
  it("ends the process and the record follows", async () => {
    const { store, db } = setup();
    const row = await store.start(shell());

    await store.close(row.id);

    await vi.waitFor(async () =>
      expect((await createSessionRepository(db).findById(row.id))?.state).toBe("exited"),
    );
  });

  it("is a no-op on a session that already ended", async () => {
    const { store, db } = setup();
    const row = await store.start(shell({ args: ["-c", "exit 0"] }));
    await vi.waitFor(async () =>
      expect((await createSessionRepository(db).findById(row.id))?.state).toBe("exited"),
    );

    await expect(store.close(row.id)).resolves.toBeUndefined();
  });

  it("reports a session that does not exist", async () => {
    const { store } = setup();

    await expect(store.close("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("listing", () => {
  it("lists a scope's sessions in the order they started", async () => {
    const { store } = setup();
    const first = await store.start(shell());
    const second = await store.start(shell());
    await store.start(shell({ scopeId: "other" }));

    const listed = await store.listByScope("project", "p1");

    expect(listed.map((row) => row.id)).toEqual([first.id, second.id]);
  });

  it("separates running sessions from finished ones", async () => {
    // F4.9 blocks a removal on live sessions; counting dead ones would block it
    // forever.
    const { store, db } = setup();
    const alive = await store.start(shell());
    const dead = await store.start(shell({ args: ["-c", "exit 0"] }));
    await vi.waitFor(async () =>
      expect((await createSessionRepository(db).findById(dead.id))?.state).toBe("exited"),
    );

    const running = await store.listRunningInScope("project", "p1");

    expect(running.map((row) => row.id)).toEqual([alive.id]);
  });

  it("keeps the ring buffer out of the database", async () => {
    // PRD §7: memory only. Persisting output nobody can reattach to would be
    // storage spent on nothing.
    const { store, db } = setup();
    const row = await store.start(shell({ args: ["-c", "echo persisted-output; sleep 30"] }));

    const stored = await createSessionRepository(db).findById(row.id);

    expect(JSON.stringify(stored)).not.toContain("persisted-output");
  });

  it("finds a session by id", async () => {
    const { store } = setup();
    const row = await store.start(shell());

    expect(await store.findById(row.id)).toMatchObject({ id: row.id });
    expect(await store.findById(newId())).toBeUndefined();
  });
});

describe("transport", () => {
  it("sends an ACP configuration to the ACP manager, and records what it is", async () => {
    const { store, db, acpManager } = setup();

    const row = await store.start(await acpAgent(db));

    expect(row).toMatchObject({
      transport: "acp",
      acpSessionId: "fake-acp-session",
      mode: "default",
      model: "opus[1m]",
    });
    // The row's id is the manager's id: one identity, no mapping table.
    expect(acpManager.get(row.id)?.acpSessionId).toBe("fake-acp-session");
  });

  it("leaves a shell on PTY even when asked for ACP", async () => {
    // F1.2. The column enforces it too, but failing in the store says why
    // instead of surfacing a CHECK the caller has to decode.
    const { store } = setup();

    const row = await store.start(shell({ transport: "acp" }));

    expect(row.transport).toBe("pty");
    expect(row.acpSessionId).toBeNull();
  });

  it("still starts a PTY agent when the configuration says so", async () => {
    const { store, db } = setup();
    const config = await createAgentConfigRepository(db).create({
      name: "claude-code",
      command: "sh",
    });

    const row = await store.start({
      kind: "agent",
      agentConfigId: config.id,
      scopeType: "worktree",
      scopeId: "w1",
      cwd: tmpdir(),
      command: "sh",
      args: ["-c", "sleep 30"],
    });

    expect(row).toMatchObject({ transport: "pty", acpSessionId: null });
  });

  it("says so plainly when no ACP manager is wired", async () => {
    // A wiring mistake, and it should read like one rather than as a crash
    // somewhere inside a spawn.
    const database = openTestDb();
    databases.push(database);
    const ptyManager = new PtyManager();
    managers.push(ptyManager);
    const store = createSessionStore({ db: database.db, ptyManager });

    await expect(store.start(await acpAgent(database.db))).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: /nenhum AcpManager/,
    });
  });

  it("kills the agent it could not write down", async () => {
    // A conversation the daemon cannot describe is one nobody can find or stop
    // from the UI.
    const { store, db, acpManager } = setup();
    const input = await acpAgent(db, { agentConfigId: "nao-existe" });

    await expect(store.start(input)).rejects.toThrow();
    expect(acpManager.list().every((info) => info.state === "exited")).toBe(true);
  });

  it("closes an ACP session through the manager the row names", async () => {
    // From the row, not from the configuration: the configuration may have been
    // edited since this session was born.
    const { store, db, acpManager } = setup();
    const row = await store.start(await acpAgent(db));

    await store.close(row.id);

    await vi.waitFor(() => expect(acpManager.get(row.id)?.state).toBe("exited"));
  });

  it("records the exit of an agent that dies on its own", async () => {
    // F3.7 for the ACP path: a quota or a crash changes the sidebar without
    // anyone having clicked anything.
    const fake = fakeAgentProcess();
    queued.push(fake.process);
    const { store, db } = setup();
    const row = await store.start(await acpAgent(db));

    fake.process.kill();

    await vi.waitFor(async () => {
      expect(await store.findById(row.id)).toMatchObject({ state: "exited", exitCode: 0 });
    });
  });

  it("keeps recording PTY exits after learning about ACP", async () => {
    // One recorder for both. The regression this guards against is subtracting
    // the old watcher while adding the new one.
    const { store } = setup();
    const row = await store.start(shell({ command: "sh", args: ["-c", "exit 3"] }));

    await vi.waitFor(async () => {
      expect(await store.findById(row.id)).toMatchObject({ state: "exited", exitCode: 3 });
    });
  });

  it("unsubscribes from both managers at once", async () => {
    const { store, db } = setup();
    const off = store.trackExits();
    off();

    // The store returned by `setup` still has its own subscription, so the row
    // must still follow the process — unsubscribing one must not deafen the other.
    const row = await store.start(await acpAgent(db));
    expect(row.transport).toBe("acp");
  });
});
