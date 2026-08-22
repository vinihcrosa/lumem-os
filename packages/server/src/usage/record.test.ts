import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { sessionUsage } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import { fakeAgentProcess, type FakeAgentTurn } from "../testing/acp-fake-agent.js";

import { trackSessionUsage } from "./record.js";

const databases: TestDb[] = [];
const managers: AcpManager[] = [];
const unhooks: (() => void)[] = [];

afterEach(async () => {
  for (const unhook of unhooks.splice(0)) unhook();
  for (const manager of managers.splice(0)) await manager.killAll();
  for (const database of databases.splice(0)) database.cleanup();
});

/** Os `usage_update` que um turno vai emitir, em ordem. */
type Windows = readonly { used: number; cost?: number }[];

interface World {
  db: Db;
  spawn(options?: { worktree?: boolean }): Promise<{ id: string; projectId: string; worktreeId: string }>;
  /** Uma sessão ACP viva **sem** linha no banco — como as do próprio daemon. */
  spawnLoose(): Promise<string>;
  turn(sessionId: string, windows: Windows): Promise<void>;
  rows(): { projectId: string; worktreeId: string; tokens: number; cost: number | null }[];
}

async function world(): Promise<World> {
  const database = openTestDb();
  databases.push(database);
  const db = database.db;

  // O roteiro do turno é lido de fora, para cada teste dizer que janelas o
  // adaptador reportou.
  const script = { windows: [] as Windows };
  const acpManager = new AcpManager({
    spawner: () =>
      fakeAgentProcess({
        prompt: async (_text, turn: FakeAgentTurn) => {
          for (const window of script.windows) {
            await turn.update({
              sessionUpdate: "usage_update",
              used: window.used,
              size: 1_000_000,
              ...(window.cost === undefined
                ? {}
                : { cost: { amount: window.cost, currency: "USD" } }),
            } as never);
          }
          return "end_turn";
        },
      }).process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
  });
  managers.push(acpManager);
  unhooks.push(trackSessionUsage({ db, acpManager }));

  const workspace = await createWorkspaceRepository(db).create({ name: "pessoal" });
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
    async spawn({ worktree = false } = {}) {
      const info = await acpManager.spawn({
        command: config.command,
        cwd: tmpdir(),
        adapterVersion: "0.40.0",
      });
      const scope = worktree
        ? await createWorktreeRepository(db).create({
            projectId: project.id,
            name: `wt-${info.id.slice(0, 6)}`,
            branch: "feat",
            path: `${tmpdir()}/wt-${info.id.slice(0, 6)}`,
          })
        : null;
      await createSessionRepository(db).create({
        id: info.id,
        kind: "agent",
        agentConfigId: config.id,
        scopeType: scope === null ? "project" : "worktree",
        scopeId: scope === null ? project.id : scope.id,
        cwd: tmpdir(),
        command: config.command,
        transport: "acp",
        acpSessionId: `acp-${info.id}`,
      });
      return { id: info.id, projectId: project.id, worktreeId: scope?.id ?? "" };
    },
    async spawnLoose() {
      const info = await acpManager.spawn({
        command: config.command,
        cwd: tmpdir(),
        adapterVersion: "0.40.0",
      });
      return info.id;
    },
    async turn(sessionId, windows) {
      script.windows = windows;
      await acpManager.prompt(sessionId, "faz algo");
      // A gravação é `void` dentro do `emit`: o turno não espera por ela.
      await vi.waitFor(() => expect(true).toBe(true));
    },
    rows() {
      return db
        .select()
        .from(sessionUsage)
        .all()
        .map((row) => ({
          projectId: row.projectId,
          worktreeId: row.worktreeId,
          tokens: row.tokens,
          cost: row.cost,
        }));
    },
  };
}

describe("trackSessionUsage", () => {
  it("grava a **variação** da janela, não a ocupação", async () => {
    const app = await world();
    const session = await app.spawn();

    await app.turn(session.id, [{ used: 39_200 }, { used: 41_000 }, { used: 44_500 }]);

    await vi.waitFor(() => expect(app.rows()).toHaveLength(3));
    // Somar `used` daria 124.700 — o mesmo contexto contado três vezes.
    expect(app.rows().map((row) => row.tokens)).toEqual([39_200, 1_800, 3_500]);
    expect(app.rows().reduce((total, row) => total + row.tokens, 0)).toBe(44_500);
  });

  it("janela que encolheu não vira consumo negativo", async () => {
    // O adaptador pode reportar menos depois de compactar a conversa.
    const app = await world();
    const session = await app.spawn();

    await app.turn(session.id, [{ used: 50_000 }, { used: 20_000 }, { used: 22_000 }]);

    await vi.waitFor(() => expect(app.rows().length).toBeGreaterThanOrEqual(2));
    expect(app.rows().every((row) => row.tokens >= 0)).toBe(true);
  });

  it("o custo soma direto: ele já é por turno", async () => {
    const app = await world();
    const session = await app.spawn();

    await app.turn(session.id, [{ used: 1_000, cost: 0.2354 }]);

    await vi.waitFor(() => expect(app.rows()).toHaveLength(1));
    expect(app.rows()[0]?.cost).toBeCloseTo(0.2354);
  });

  it("agente que não reporta custo grava `null`, e não zero", async () => {
    // Um agente que não informa dinheiro não pode parecer grátis.
    const app = await world();
    const session = await app.spawn();

    await app.turn(session.id, [{ used: 1_000 }]);

    await vi.waitFor(() => expect(app.rows()).toHaveLength(1));
    expect(app.rows()[0]?.cost).toBeNull();
  });

  it("sessão de worktree paga pela worktree **e** pelo projeto dela", async () => {
    const app = await world();
    const session = await app.spawn({ worktree: true });

    await app.turn(session.id, [{ used: 5_000 }]);

    await vi.waitFor(() => expect(app.rows()).toHaveLength(1));
    // O projeto é resolvido na escrita: agregar por ele depois seria join
    // polimórfico em `session.scope_id`.
    expect(app.rows()[0]).toMatchObject({
      projectId: session.projectId,
      worktreeId: session.worktreeId,
    });
  });

  it("sessão sem linha no banco não é cobrada de ninguém", async () => {
    /*
     * É o caso das sessões que o daemon sobe para si: a destilação da memória e o
     * agente de pesquisa do auto-learn. O consumo delas é real, e atribuí-lo a um
     * projeto seria contar como trabalho seu algo que o sistema fez sozinho.
     */
    const app = await world();
    const loose = await app.spawnLoose();

    await app.turn(loose, [{ used: 39_200 }]);

    // Esperar de verdade: a gravação é assíncrona, então "não gravou" só vale
    // depois de dar tempo de gravar.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.rows()).toEqual([]);
  });
});
