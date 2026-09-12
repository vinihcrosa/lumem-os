import { tmpdir } from "node:os";

import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { session as session_, task } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { createEventBus, type LumemEvent } from "../events.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createTaskRepository } from "../repositories/task.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";

import { trackTaskProgress } from "./progress.js";

/**
 * `in_progress` derivado do primeiro prompt (`022` T6).
 *
 * Com agente falso e zero token: o que está em teste é a costura, não o
 * adaptador. E a mutação que este arquivo cobra está no último caso — desligar
 * o observador tem que derrubar um teste, senão ele é decoração.
 */

const databases: TestDb[] = [];
const managers: AcpManager[] = [];
const unhooks: (() => void)[] = [];

afterEach(async () => {
  for (const unhook of unhooks.splice(0)) unhook();
  for (const manager of managers.splice(0)) await manager.killAll();
  for (const database of databases.splice(0)) database.cleanup();
});

interface World {
  db: Db;
  projectId: string;
  workspaceId: string;
  emitted: LumemEvent[];
  /** Uma sessão de agente viva, opcionalmente ligada a uma tarefa. */
  spawn(taskId?: string): Promise<string>;
  turn(sessionId: string): Promise<void>;
  statusOf(taskId: string): Promise<string | undefined>;
}

async function world({ track = true } = {}): Promise<World> {
  const database = openTestDb();
  databases.push(database);
  const db = database.db;

  const acpManager = new AcpManager({
    spawner: () => fakeAgentProcess({ prompt: async () => "end_turn" }).process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
  });
  managers.push(acpManager);

  const events = createEventBus();
  const emitted: LumemEvent[] = [];
  const originalEmit = events.emit.bind(events);
  events.emit = (event) => {
    emitted.push(event);
    originalEmit(event);
  };

  if (track) unhooks.push(trackTaskProgress({ db, acpManager, events }));

  const workspace = await createWorkspaceRepository(db).create({ name: "acme" });
  const project = await createProjectRepository(db).create({
    workspaceId: workspace.id,
    name: "api",
    path: tmpdir(),
    defaultBranch: "main",
  });
  const config = await createAgentConfigRepository(db).create({
    name: "claude",
    command: "claude-agent-acp",
    transport: "acp",
    adapterVersion: "0.40.0",
  });

  return {
    db,
    projectId: project.id,
    workspaceId: workspace.id,
    emitted,
    async spawn(taskId) {
      const info = await acpManager.spawn({
        command: config.command,
        cwd: tmpdir(),
        adapterVersion: "0.40.0",
      });
      await createSessionRepository(db).create({
        id: info.id,
        kind: "agent",
        agentConfigId: config.id,
        scopeType: "project",
        scopeId: project.id,
        cwd: tmpdir(),
        command: config.command,
        transport: "acp",
        acpSessionId: `acp-${info.id}`,
      });
      if (taskId) await db.update(session_).set({ taskId }).where(eq(session_.id, info.id));
      return info.id;
    },
    async turn(sessionId) {
      await acpManager.prompt(sessionId, "faz algo");
      // A escrita é `void` dentro do observador: o turno não espera por ela.
      await vi.waitFor(async () => {
        expect(await db.select().from(task)).toBeDefined();
      });
    },
    async statusOf(taskId) {
      const [row] = await db.select().from(task).where(eq(task.id, taskId));
      return row?.status;
    },
  };
}


async function openTask(w: World, status = "open"): Promise<string> {
  const created = await createTaskRepository(w.db).create({
    workspaceId: w.workspaceId,
    projectId: w.projectId,
    title: "o endpoint /orders devolve 500",
  });
  if (status !== "open") {
    await w.db.update(task).set({ status }).where(eq(task.id, created.id));
  }
  return created.id;
}

describe("o primeiro prompt move a seta", () => {
  it("abre a tarefa da sessão, e avisa o workspace", async () => {
    const w = await world();
    const taskId = await openTask(w);
    const sessionId = await w.spawn(taskId);

    await w.turn(sessionId);

    await vi.waitFor(async () => expect(await w.statusOf(taskId)).toBe("in_progress"));
    expect(w.emitted).toContainEqual({ type: "task.changed", workspaceId: w.workspaceId });
  });

  it("sessão sem tarefa não muda nada", async () => {
    const w = await world();
    const taskId = await openTask(w);
    const sessionId = await w.spawn();

    await w.turn(sessionId);

    expect(await w.statusOf(taskId)).toBe("open");
  });

  it("o segundo prompt não reescreve — a condição está no WHERE", async () => {
    const w = await world();
    const taskId = await openTask(w);
    const sessionId = await w.spawn(taskId);
    await w.turn(sessionId);
    await vi.waitFor(async () => expect(await w.statusOf(taskId)).toBe("in_progress"));
    const before = w.emitted.filter((event) => event.type === "task.changed").length;

    await w.turn(sessionId);
    await w.turn(sessionId);

    expect(w.emitted.filter((event) => event.type === "task.changed").length).toBe(before);
  });

  it.each(["review", "proposed"])("não desfaz o estado %s", async (status) => {
    // `review` o agente pôs de propósito, e `proposed` ainda não foi aprovada.
    // Nos dois casos, mover aqui apagaria uma decisão que alguém tomou.
    const w = await world();
    const taskId = await openTask(w, status);
    const sessionId = await w.spawn(taskId);

    await w.turn(sessionId);

    expect(await w.statusOf(taskId)).toBe(status);
  });

  it("sem o observador, a tarefa não anda — a mutação que este arquivo cobra", async () => {
    const w = await world({ track: false });
    const taskId = await openTask(w);
    const sessionId = await w.spawn(taskId);

    await w.turn(sessionId);

    expect(await w.statusOf(taskId)).toBe("open");
  });
});
