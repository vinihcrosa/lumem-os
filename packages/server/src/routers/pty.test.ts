import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createCallerFactory } from "../trpc.js";
import { appRouter } from "./index.js";

const createCaller = createCallerFactory(appRouter);
const managers: PtyManager[] = [];
const databases: TestDb[] = [];

function caller(env: { LUMEM_DEFAULT_CWD?: string; SHELL?: string } = {}) {
  const ptyManager = new PtyManager();
  managers.push(ptyManager);
  const database = openTestDb();
  databases.push(database);
  const config = loadConfig({ LUMEM_DEFAULT_CWD: mkdtempSync(join(tmpdir(), "lumem-pty-")), ...env });
  return { api: createCaller({ config, db: database.db, ptyManager }), ptyManager, config };
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
  for (const database of databases.splice(0)) database.cleanup();
});

describe("pty.spawnShell", () => {
  it("starts a session in the configured directory", async () => {
    const { api, config } = caller();

    const session = await api.pty.spawnShell();

    expect(session.state).toBe("running");
    expect(session.cwd).toBe(config.defaultCwd);
    expect(session.command).toBe(config.shell);
  });

  it("honours the size the client asks for", async () => {
    const { api } = caller();

    const session = await api.pty.spawnShell({ cols: 132, rows: 43 });

    // The browser knows how big the terminal is; the daemon does not. Ignoring
    // this leaves every session at 80x24 until the first manual resize.
    expect(session).toMatchObject({ cols: 132, rows: 43 });
  });

  it("refuses a size the schema does not allow", async () => {
    const { api } = caller();

    await expect(api.pty.spawnShell({ cols: 0, rows: 24 })).rejects.toThrow(TRPCError);
  });

  it("reports a working directory that does not exist as a bad request", async () => {
    const { api } = caller({ LUMEM_DEFAULT_CWD: "/nonexistent-lumem-dir-xyz" });

    // node-pty would silently produce a terminal that closed for no reason.
    await expect(api.pty.spawnShell()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps concurrent sessions apart", async () => {
    const { api } = caller();

    const a = await api.pty.spawnShell();
    const b = await api.pty.spawnShell();

    expect(a.id).not.toBe(b.id);
    expect((await api.pty.list()).map((session) => session.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });
});

describe("pty.list", () => {
  it("is empty before anything is spawned", async () => {
    const { api } = caller();

    expect(await api.pty.list()).toEqual([]);
  });

  it("keeps reporting a session after it exited", async () => {
    // The buffer of a finished command is still worth reading.
    const { api, ptyManager } = caller();
    const session = await api.pty.spawnShell();
    ptyManager.kill(session.id);
    await vi.waitFor(() => expect(ptyManager.get(session.id)?.state).toBe("exited"));

    const listed = await api.pty.list();

    expect(listed).toHaveLength(1);
    expect(listed[0]?.state).toBe("exited");
  });
});

describe("pty.get", () => {
  it("returns the session", async () => {
    const { api } = caller();
    const session = await api.pty.spawnShell();

    expect(await api.pty.get({ id: session.id })).toMatchObject({ id: session.id });
  });

  it("returns null for a session that never existed", async () => {
    const { api } = caller();

    expect(await api.pty.get({ id: "nope" })).toBeNull();
  });
});

describe("pty.close", () => {
  it("ends the session", async () => {
    const { api, ptyManager } = caller();
    const session = await api.pty.spawnShell();

    await api.pty.close({ id: session.id });

    await vi.waitFor(() => expect(ptyManager.get(session.id)?.state).toBe("exited"));
  });

  it("reports an unknown session as not found", async () => {
    const { api } = caller();

    await expect(api.pty.close({ id: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not touch the other sessions", async () => {
    const { api, ptyManager } = caller();
    const doomed = await api.pty.spawnShell();
    const survivor = await api.pty.spawnShell();

    await api.pty.close({ id: doomed.id });

    await vi.waitFor(() => expect(ptyManager.get(doomed.id)?.state).toBe("exited"));
    expect(ptyManager.get(survivor.id)?.state).toBe("running");
  });
});
