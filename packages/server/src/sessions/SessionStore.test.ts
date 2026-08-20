import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { newId } from "@lumem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Db } from "../db/index.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { AcpManager } from "../acp/AcpManager.js";
import { listSignals } from "../memory/signals.js";
import { PtyManager } from "../pty/PtyManager.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import {
  createMemoryTranscriptStore,
  type TranscriptStore,
} from "../acp/TranscriptStore.js";
import { cleanupGitFixtures, createRepo, runGit } from "../testing/git-fixtures.js";
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
  transcripts: TranscriptStore;
} {
  const database = openTestDb();
  databases.push(database);
  const ptyManager = new PtyManager();
  managers.push(ptyManager);
  // Named here rather than left to the manager's default, so a test can read what the
  // conversation recorded — which is how "resuming carries the history" is checked.
  const transcripts = createMemoryTranscriptStore();
  const acpManager = new AcpManager({
    spawner: () => queued.shift() ?? fakeAgentProcess().process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
    transcripts,
  });
  acpManagers.push(acpManager);
  const store = createSessionStore({ db: database.db, ptyManager, acpManager });
  unsubscribes.push(store.trackExits());
  return { store, db: database.db, ptyManager, acpManager, transcripts };
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

describe("the switch persists on the session", () => {
  it("writes the mode the session chose, not the configuration's default", async () => {
    // D9 and A8: `agent_config` keeps the default, the session keeps its choice, and
    // reopening the tab has to show the choice.
    const { store, db, acpManager } = setup();
    const row = await store.start(await acpAgent(db));
    expect(row.mode).toBe("default");

    await acpManager.setConfig(row.id, "mode", "plan");

    await vi.waitFor(async () => {
      expect(await store.findById(row.id)).toMatchObject({ mode: "plan" });
    });
  });

  it("writes the model too, as the agent reports it", async () => {
    /*
     * Scripted rather than left to the default fake, which answers every switch
     * with `opus[1m]` — the first version of this test asserted `opus[1m]` after
     * switching to `sonnet` and passed for the wrong reason. What it proves now is
     * that the value the *agent* reports is the value that lands in the row.
     */
    queued.push(
      fakeAgentProcess({
        setConfigOption: () =>
          [
            {
              id: "model",
              name: "Model",
              category: "model",
              type: "select",
              currentValue: "sonnet",
              options: [{ value: "sonnet", name: "sonnet" }],
            },
          ] as never,
      }).process,
    );
    const { store, db, acpManager } = setup();
    const row = await store.start(await acpAgent(db));

    await acpManager.setConfig(row.id, "model", "sonnet");

    await vi.waitFor(async () => {
      expect(await store.findById(row.id)).toMatchObject({ model: "sonnet" });
    });
  });

  it("leaves an exited session's record alone", async () => {
    // A switch racing an exit must not resurrect the row's idea of what it was
    // doing. The write is scoped to `running` for that reason.
    const { store, db } = setup();
    const row = await store.start(await acpAgent(db));
    const sessions = createSessionRepository(db);
    await sessions.markExited(row.id, 0);

    await sessions.setConfig(row.id, { mode: "plan" });

    expect(await store.findById(row.id)).toMatchObject({ state: "exited", mode: "default" });
  });

  it("does not touch a PTY session, which has no mode to switch", async () => {
    const { store } = setup();
    const row = await store.start(shell());

    expect(row.mode).toBeNull();
  });
});

describe("resuming", () => {
  /**
   * F5.2, D12. The store is where "resume" stops being a protocol call and becomes a
   * fact about the registry: a new row, carrying the old conversation's id and
   * pointing back at the session that died.
   */

  /**
   * Starts an ACP session, says one thing, and lets it die.
   *
   * The turn is not decoration: a session that never spoke has nothing to carry
   * forward, and the assertions about the history would pass on an empty copy.
   */
  async function ended(db: Db, store: SessionStore, acpManager: AcpManager) {
    const row = await store.start(await acpAgent(db));
    await acpManager.prompt(row.id, "algo dito ontem");
    acpManager.kill(row.id);
    await vi.waitFor(async () =>
      expect((await store.findById(row.id))?.state).toBe("exited"),
    );
    return row;
  }

  it("creates a new session that points back at the old one", async () => {
    const { store, db, acpManager } = setup();
    const old = await ended(db, store, acpManager);

    const resumed = await store.resume(old.id);

    expect(resumed.id).not.toBe(old.id);
    expect(resumed.resumedFromId).toBe(old.id);
    // The agent's own id is the one thing carried across: it is what `session/load`
    // names, and the reason the conversation continues instead of starting over.
    expect(resumed.acpSessionId).toBe(old.acpSessionId);
    expect(resumed.state).toBe("running");
  });

  it("keeps the old row exactly as it was", async () => {
    // The session that died stays dead, with its transcript. Rewriting it would make
    // yesterday's conversation disappear from the list the moment it was continued.
    const { store, db, acpManager } = setup();
    const old = await ended(db, store, acpManager);

    await store.resume(old.id);

    expect(await store.findById(old.id)).toMatchObject({
      id: old.id,
      state: "exited",
      resumedFromId: null,
    });
  });

  it("inherits the scope, the checkout and the configuration", async () => {
    const { store, db, acpManager } = setup();
    const old = await ended(db, store, acpManager);

    const resumed = await store.resume(old.id);

    expect(resumed).toMatchObject({
      scopeType: old.scopeType,
      scopeId: old.scopeId,
      cwd: old.cwd,
      command: old.command,
      agentConfigId: old.agentConfigId,
      transport: "acp",
    });
  });

  it("refuses a session that is still alive, with a reason", async () => {
    // Two adapters against one conversation would give the user two windows onto the
    // same history, both able to write into it.
    const { store, db } = setup();
    const row = await store.start(await acpAgent(db));

    await expect(store.resume(row.id)).rejects.toThrow(/ainda está viva/);
  });

  it("refuses a shell", async () => {
    const { store } = setup();
    const row = await store.start(shell());
    await store.close(row.id);
    await vi.waitFor(async () => expect((await store.findById(row.id))?.state).toBe("exited"));

    await expect(store.resume(row.id)).rejects.toThrow(/só conversa ACP/);
  });

  it("refuses a session that does not exist", async () => {
    const { store } = setup();

    await expect(store.resume(newId())).rejects.toThrow(/não existe/);
  });

  it("refuses when no ACP manager was wired", async () => {
    // A wiring mistake, and it should read like one rather than as a crash.
    const database = openTestDb();
    databases.push(database);
    const ptyManager = new PtyManager();
    managers.push(ptyManager);
    const withAcp = setup();
    const old = await ended(withAcp.db, withAcp.store, withAcp.acpManager);

    const store = createSessionStore({ db: withAcp.db, ptyManager });

    await expect(store.resume(old.id)).rejects.toThrow(/nenhum AcpManager/);
  });

  it("carries the conversation forward, with a separator", async () => {
    // D15: the new session's transcript is self-contained — the old conversation copied
    // in front of it, and the resume recorded as an event so a replay draws the
    // separator in the same place the live client did.
    const { store, db, acpManager, transcripts } = setup();
    const old = await ended(db, store, acpManager);

    const resumed = await store.resume(old.id);

    const events = transcripts.read(resumed.id).map((entry) => entry.event.type);
    // The history first, the separator last: the order on disk is the order on screen.
    expect(events).toEqual(["message", "turn_end", "resumed"]);
    // And the old record is still its own — a copy, not a move.
    expect(transcripts.read(old.id).map((entry) => entry.event.type)).toEqual([
      "message",
      "turn_end",
    ]);
  });

  it("kills the adapter it could not write down", async () => {
    /*
     * Same rule as `start`: a conversation the daemon cannot describe is one nobody
     * can find or stop from the UI.
     *
     * Forced with a stub rather than with a broken row, because there is no legal way
     * in from outside: `start` can be handed a configuration id that does not exist,
     * while everything `resume` inserts is copied from a row the schema already
     * accepted. What the stub controls is the one thing that matters here — the id the
     * insert will collide with.
     */
    const { store: seeded, db, acpManager } = setup();
    const old = await ended(db, seeded, acpManager);
    const taken = await seeded.start(await acpAgent(db));

    const killed: string[] = [];
    const stub = {
      resume: () => Promise.resolve({ ...acpManager.get(taken.id)!, id: taken.id }),
      kill: (id: string) => killed.push(id),
    } as unknown as AcpManager;
    // Sanity: without a collision the insert would succeed and the assertion below
    // would pass for the wrong reason.
    expect(await seeded.findById(taken.id)).toBeDefined();
    const ptyManager = new PtyManager();
    managers.push(ptyManager);
    const store = createSessionStore({ db, ptyManager, acpManager: stub });

    await expect(store.resume(old.id)).rejects.toThrow();
    expect(killed).toEqual([taken.id]);
  });
});

describe("reading a finished conversation", () => {
  /**
   * D13: reading is not resuming. Nothing is launched to answer this — standing up an
   * adapter costs ~39k tokens of system prompt before the first word, and clicking a
   * tab to reread something must not spend that.
   */

  it("gives back the same frame an attach would", async () => {
    const { store, db, acpManager } = setup();
    const row = await store.start(await acpAgent(db));
    await acpManager.prompt(row.id, "uma pergunta");
    acpManager.kill(row.id);
    await vi.waitFor(async () => expect((await store.findById(row.id))?.state).toBe("exited"));

    const frame = await store.transcript(row.id);

    expect(frame).toMatchObject({
      type: "attached",
      sessionId: row.id,
      state: "exited",
      acpSessionId: "fake-acp-session",
      model: "opus[1m]",
    });
    expect(frame.transcript.length).toBeGreaterThan(0);
  });

  it("does not bring the session back to life", async () => {
    const { store, db, acpManager } = setup();
    const row = await store.start(await acpAgent(db));
    acpManager.kill(row.id);
    await vi.waitFor(async () => expect((await store.findById(row.id))?.state).toBe("exited"));

    await store.transcript(row.id);

    expect(acpManager.list().every((info) => info.state === "exited")).toBe(true);
    expect((await store.findById(row.id))?.state).toBe("exited");
  });

  it("reads a session that never spoke as an empty conversation", async () => {
    const { store, db } = setup();
    const row = await store.start(await acpAgent(db));

    expect((await store.transcript(row.id)).transcript).toEqual([]);
  });

  it("refuses a shell: what a shell has is scrollback", async () => {
    const { store } = setup();
    const row = await store.start(shell());

    await expect(store.transcript(row.id)).rejects.toThrow(/scrollback/);
  });

  it("refuses a session that does not exist", async () => {
    const { store } = setup();

    await expect(store.transcript(newId())).rejects.toThrow(/não existe/);
  });
});

describe("os sinais que a saída de uma sessão produz (Q17)", () => {
  afterEach(() => {
    cleanupGitFixtures();
  });

  /** Uma sessão de agente que morre no ato, no diretório pedido. */
  async function agentThatDiesAt(
    store: SessionStore,
    db: Db,
    cwd: string,
  ): Promise<{ id: string }> {
    const config = await createAgentConfigRepository(db).create({ name: "fixture", command: "sh" });
    const row = await store.start(
      shell({
        kind: "agent",
        agentConfigId: config.id,
        scopeType: "worktree",
        scopeId: "wt1",
        cwd,
        args: ["-c", "exit 0"],
      }),
    );
    return { id: row.id };
  }

  it("registra a sessão de agente que morreu cedo, com quantos segundos viveu", async () => {
    const { store, db } = setup();
    const repo = await createRepo({ branch: "main" });

    const { id } = await agentThatDiesAt(store, db, repo);

    await vi.waitFor(() => {
      const [signal] = listSignals(db, { kind: "session_killed_early" });
      expect(signal?.target).toBe(id);
      expect(signal?.sessionId).toBe(id);
      expect(signal?.worktreeId).toBe("wt1");
      // Segundos de vida, e nada mais: `detail` é número (Q18).
      expect(signal?.detail).toBeGreaterThanOrEqual(0);
      expect(signal?.detail).toBeLessThan(30);
    }, { timeout: 5_000 });
  });

  it("um shell que viveu quatro segundos é um shell, e não vira sinal", async () => {
    const { store, db } = setup();
    const repo = await createRepo({ branch: "main" });
    const row = await store.start(shell({ cwd: repo, args: ["-c", "exit 0"] }));

    await vi.waitFor(
      async () => expect((await createSessionRepository(db).findById(row.id))?.state).toBe("exited"),
      { timeout: 5_000 },
    );

    expect(listSignals(db, { kind: "session_killed_early" })).toHaveLength(0);
  });

  it("acha o revert no `git log` do checkout, sem ninguém ter revertido pelo Lumem", async () => {
    // Procurar em vez de instrumentar: o revert aqui é feito pelo git, na mão.
    const { store, db } = setup();
    const repo = await createRepo({ branch: "main" });
    writeFileSync(join(repo, "cache.ts"), "const cache = new Map();\n");
    await runGit(repo, "add", "cache.ts");
    await runGit(repo, "commit", "-m", "feat: cache agressivo no loader");
    const reverted = (await runGit(repo, "rev-parse", "HEAD")).trim();
    await runGit(repo, "revert", "--no-edit", "HEAD");

    await agentThatDiesAt(store, db, repo);

    await vi.waitFor(() => {
      const [signal] = listSignals(db, { kind: "user_reverted_agent_commit" });
      // O alvo é o SHA desfeito. O assunto do commit não chega ao banco.
      expect(signal?.target).toBe(reverted);
      expect(signal?.worktreeId).toBe("wt1");
    }, { timeout: 5_000 });
  });

  it("um histórico sem revert não inventa sinal", async () => {
    const { store, db } = setup();
    const repo = await createRepo({ branch: "main" });
    await runGit(repo, "commit", "--allow-empty", "-m", "docs: explica como reverter um commit");

    const { id } = await agentThatDiesAt(store, db, repo);

    await vi.waitFor(
      async () => expect((await createSessionRepository(db).findById(id))?.state).toBe("exited"),
      { timeout: 5_000 },
    );
    expect(listSignals(db, { kind: "user_reverted_agent_commit" })).toHaveLength(0);
  });

  it("um checkout que sumiu junto com a sessão não derruba o registro da saída", async () => {
    const { store, db } = setup();
    const repo = await createRepo({ branch: "main" });
    const { id } = await agentThatDiesAt(store, db, repo);
    rmSync(repo, { recursive: true, force: true });

    await vi.waitFor(
      async () => expect((await createSessionRepository(db).findById(id))?.state).toBe("exited"),
      { timeout: 5_000 },
    );

  });
});
