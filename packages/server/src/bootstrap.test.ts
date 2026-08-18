import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { openTestDb, type TestDb } from "./db/testing.js";
import { MemoryService } from "./memory/MemoryService.js";
import { ensureMemoryHome } from "./memory/home.js";
import { PtyManager } from "./pty/PtyManager.js";
import { createProjectRepository } from "./repositories/project.js";
import { createWorkspaceRepository } from "./repositories/workspace.js";
import { createWorktreeRepository } from "./repositories/worktree.js";
import { SHUTDOWN_SIGNALS } from "./signals.js";

const started: FastifyInstance[] = [];
const stateDirs: string[] = [];
const managers: PtyManager[] = [];
const databases: TestDb[] = [];

async function boot(
  overrides: {
    port?: string;
    beforeClose?: () => Promise<void>;
    ptyManager?: PtyManager;
    database?: TestDb;
    stateDir?: string;
  } = {},
) {
  const signalSource = new EventEmitter();
  const exit = vi.fn();
  // Never the real ~/.lumem either: boot now creates directories and a git
  // repository there, and a test suite that touches the developer's own state
  // is a test suite that eventually destroys it.
  const stateDir = overrides.stateDir ?? join(mkdtempSync(join(tmpdir(), "lumem-boot-")), ".lumem");
  if (!overrides.stateDir) stateDirs.push(stateDir);
  // Port 0 lets the OS pick a free one — no fixed port to collide with.
  const config = loadConfig({ LUMEM_PORT: overrides.port ?? "0", LUMEM_STATE_DIR: stateDir });
  // Never the real ~/.lumem/lumem.db: a test suite must not write to the
  // developer's own state.
  const database = overrides.database ?? openTestDb();
  if (!overrides.database) databases.push(database);

  const app = await bootstrap({
    config,
    signalSource,
    exit,
    logger: false,
    database,
    ...(overrides.ptyManager ? { ptyManager: overrides.ptyManager } : {}),
    ...(overrides.beforeClose ? { beforeClose: overrides.beforeClose } : {}),
  });
  started.push(app);

  return { app, signalSource, exit, config, stateDir };
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((app) => app.close()));
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
  for (const database of databases.splice(0)) database.cleanup();
  for (const dir of stateDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("bootstrap", () => {
  it("listens on the configured host", async () => {
    const { app } = await boot();

    expect(app.server.listening).toBe(true);
    expect(app.server.address()).toMatchObject({ address: "127.0.0.1" });
  });

  it("prepares the memory home before serving", async () => {
    const { stateDir } = await boot();

    // A memória do workspace precisa existir antes do primeiro cliente: é onde
    // o banco vive, e é o `.gitignore` daqui que impede o banco de virar
    // histórico.
    expect(existsSync(join(stateDir, "memory"))).toBe(true);
    expect(existsSync(join(stateDir, ".git"))).toBe(true);
    expect(existsSync(join(stateDir, ".gitignore"))).toBe(true);
  });

  it("refaz o índice de memória atrasado antes de servir", async () => {
    const stateDir = join(mkdtempSync(join(tmpdir(), "lumem-boot-")), ".lumem");
    stateDirs.push(stateDir);
    await ensureMemoryHome({ stateDir });
    const database = openTestDb();
    databases.push(database);
    const memory = new MemoryService({ db: database.db, stateDir });
    await memory.write({
      name: "Rollback do checkout",
      description: "como desfazer um deploy ruim",
      type: "process",
      body: "reverte o deploy e avisa o time",
      actor: "human",
      workspaceId: "ws1",
    });
    // Todo banco anterior à feature de busca é isto: catálogo de pé, índice
    // nunca criado. Sem o boot refazendo, a primeira busca responde "nada
    // encontrado" para o acervo inteiro, sem erro e sem sinal.
    database.db.run(sql`DROP TABLE memory_fts`);

    await boot({ database, stateDir });

    // Pelo **corpo**, e por dois termos que só existem nele: o índice refeito a
    // partir do catálogo não teria texto nenhum para casar.
    expect(memory.search("avisa time", { workspaceId: "ws1" }).hits).toHaveLength(1);
  });

  it("serves the trpc router once listening", async () => {
    const { app } = await boot();

    const response = await app.inject({ method: "GET", url: "/trpc/health" });

    expect(response.statusCode).toBe(200);
  });

  it("registers a shutdown handler for every signal", async () => {
    // Deleting the installSignalHandlers call used to pass every gate.
    const { signalSource } = await boot();

    for (const signal of SHUTDOWN_SIGNALS) {
      expect(signalSource.listenerCount(signal)).toBe(1);
    }
  });

  it("closes the server when a signal arrives", async () => {
    const { app, signalSource, exit } = await boot();

    signalSource.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(app.server.listening).toBe(false);
  });

  it("kills the PTY children before closing the server", async () => {
    // app.close() knows nothing about them, so without this SIGTERM orphans
    // every shell the daemon spawned.
    const ptyManager = new PtyManager();
    managers.push(ptyManager);
    const { signalSource, exit } = await boot({ ptyManager });
    const session = ptyManager.spawn({ command: "sh", args: ["-c", "sleep 30"], cwd: tmpdir() });

    signalSource.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(ptyManager.get(session.id)?.state).toBe("exited");
  });

  it("runs beforeClose while the server is still listening", async () => {
    let appRef: FastifyInstance | undefined;
    const seen: { calls: number; listeningWhenCalled?: boolean } = { calls: 0 };

    const { app, signalSource, exit } = await boot({
      beforeClose: async () => {
        seen.calls += 1;
        seen.listeningWhenCalled = appRef?.server.listening;
      },
    });
    appRef = app;

    signalSource.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(seen.calls).toBe(1);
    expect(seen.listeningWhenCalled).toBe(true);
    expect(app.server.listening).toBe(false);
  });

  it("still exits non-zero when beforeClose throws", async () => {
    const { signalSource, exit } = await boot({
      beforeClose: () => Promise.reject(new Error("pty kill failed")),
    });

    signalSource.emit("SIGTERM");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });

  it("reconciles the worktree registry before it can serve anything", async () => {
    // F7.4. Ordering matters: a client that connects mid-reconciliation reads
    // states that are about to change under it, so this runs before listen().
    const database = openTestDb();
    databases.push(database);
    const workspace = await createWorkspaceRepository(database.db).create({ name: "pessoal" });
    const project = await createProjectRepository(database.db).create({
      workspaceId: workspace.id,
      name: "lorebase",
      path: "/repos/lorebase",
      defaultBranch: "main",
    });
    const worktrees = createWorktreeRepository(database.db);
    const registered = await worktrees.create({
      projectId: project.id,
      name: "teste",
      branch: "teste",
      path: "/definitely-not-here-xyz/teste",
    });

    const { app } = await boot({ database });

    // The very first request the daemon can answer already sees the new state.
    expect((await app.inject({ method: "GET", url: "/trpc/health" })).statusCode).toBe(200);
    expect((await worktrees.findById(registered.id))?.state).toBe("missing");
  });

  it("exits non-zero when the port is already taken", async () => {
    const first = await boot();
    const address = first.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const second = await boot({ port: String(port) });

    expect(second.exit).toHaveBeenCalledWith(1);
    expect(second.app.server.listening).toBe(false);
  });
});
