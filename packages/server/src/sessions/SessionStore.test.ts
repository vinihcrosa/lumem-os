import { tmpdir } from "node:os";

import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../db/index.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import { createSessionStore, type SessionStore } from "./SessionStore.js";

const managers: PtyManager[] = [];
const databases: TestDb[] = [];
const unsubscribes: (() => void)[] = [];

function setup(): { store: SessionStore; db: Db; ptyManager: PtyManager } {
  const database = openTestDb();
  databases.push(database);
  const ptyManager = new PtyManager();
  managers.push(ptyManager);
  const store = createSessionStore({ db: database.db, ptyManager });
  unsubscribes.push(store.trackExits());
  return { store, db: database.db, ptyManager };
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
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
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
