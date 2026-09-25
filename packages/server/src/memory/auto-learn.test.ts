import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { CLAUDE_ADAPTER } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import { agentConfig } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { adaptersDir } from "../setup/adapter-command.js";
import { adapterBinaryPath } from "../setup/install-adapter.js";
import { fakeAgentProcess } from "../testing/acp-fake-agent.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { createAutoLearn, type AutoLearn } from "./auto-learn.js";
import { ensureMemoryHome } from "./home.js";

const databases: TestDb[] = [];
const managers: AcpManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.killAll();
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

const WITH_EVIDENCE = JSON.stringify({
  answer: "O checkout expõe POST /v2/checkout.",
  memories: [
    {
      type: "project",
      name: "Endpoint de checkout",
      description: "o caminho que o web consome",
      body: "POST /v2/checkout, com cupom opcional.",
      evidence: "src/api/checkout.ts:88",
    },
  ],
});

const WITHOUT_EVIDENCE = JSON.stringify({
  answer: "Acho que é /v2/checkout.",
  memories: [
    {
      type: "project",
      name: "Endpoint de checkout",
      description: "o caminho que o web consome",
      body: "POST /v2/checkout.",
    },
  ],
});

interface World {
  learn: AutoLearn;
  memory: MemoryService;
  sessionId: string;
  prompts: number;
  /** O `command` de cada `spawn`, na ordem — é o que diz qual cópia subiu. */
  spawned: readonly string[];
  stateDir: string;
  configId: string;
  db: Db;
}

/** A cópia que o daemon instalou: desde 2026-09-08, a única que ele lança. */
function stageManagedAdapter(stateDir: string): string {
  const managed = adapterBinaryPath(adaptersDir(stateDir), CLAUDE_ADAPTER);
  mkdirSync(dirname(managed), { recursive: true });
  writeFileSync(managed, "#!/bin/sh\ncat\n");
  chmodSync(managed, 0o755);
  return managed;
}

async function world(
  options: { answer?: string; budget?: number; enabled?: boolean; staged?: boolean } = {},
): Promise<World> {
  const stateDir = join(tempDir("lumem-autolearn-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  if (options.staged ?? true) stageManagedAdapter(stateDir);
  const database = openTestDb();
  databases.push(database);
  const db = database.db;

  const state = { prompts: 0 };
  const spawned: string[] = [];
  const acpManager = new AcpManager({
    spawner: ({ command }) => {
      spawned.push(command);
      return fakeAgentProcess({
        prompt: async (_text, turn) => {
          state.prompts += 1;
          await turn.update({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: options.answer ?? WITH_EVIDENCE },
          });
          return "end_turn";
        },
      }).process;
    },
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
  });
  managers.push(acpManager);

  const workspace = await createWorkspaceRepository(db).create({ name: "pessoal" });
  const project = await createProjectRepository(db).create({
    workspaceId: workspace.id,
    name: "api",
    path: stateDir,
    defaultBranch: "main",
  });
  const config = await createAgentConfigRepository(db).create({
    name: "claude",
    command: "claude-agent-acp",
    adapterVersion: "0.40.0",
  });
  const session = await createSessionRepository(db).create({
    id: "ses_1",
    kind: "agent",
    agentConfigId: config.id,
    scopeType: "project",
    scopeId: project.id,
    cwd: stateDir,
    command: config.command,
    transport: "acp",
    acpSessionId: "acp_1",
  });

  return {
    learn: createAutoLearn({
      db,
      stateDir,
      acpManager,
      enabled: options.enabled ?? true,
      budget: options.budget ?? 3,
    }),
    memory: new MemoryService({ db, stateDir }),
    sessionId: session.id,
    get prompts() {
      return state.prompts;
    },
    spawned,
    stateDir,
    configId: config.id,
    db,
  } as World;
}

describe("createAutoLearn", () => {
  it("com evidência verificável, grava direto — marcada como não verificada", async () => {
    const { learn, memory, sessionId } = await world();

    const result = await learn("qual é o endpoint de checkout?", sessionId);

    expect(result.answer).toContain("/v2/checkout");
    expect(result.written).toEqual([{ name: "Endpoint de checkout", route: "direct" }]);
    const [entry] = memory.list();
    expect(entry?.sourceActor).toBe("auto_research");
    // Confiança baixa e marca no corpo: nasceu de uma pergunta que o acervo não
    // sabia responder, e ninguém conferiu.
    expect(entry?.confidence).toBe("low");
    const stored = await memory.read("project", "Endpoint de checkout", "project", {
      workspaceId: entry!.workspaceId!,
      projectId: entry!.projectId!,
    });
    expect(stored.body).toContain("não verificada");
    expect(stored.body).toContain("src/api/checkout.ts:88");
  });

  it("sem evidência, vira proposta em vez de memória", async () => {
    const { learn, memory, sessionId } = await world({ answer: WITHOUT_EVIDENCE });

    const result = await learn("qual é o endpoint?", sessionId);

    expect(result.written).toEqual([{ name: "Endpoint de checkout", route: "proposal" }]);
    expect(memory.list()).toHaveLength(0);
    expect(memory.proposals({ status: "pending" })).toHaveLength(1);
  });

  it("a mesma pergunta duas vezes não sobe agente duas vezes (§5.4)", async () => {
    const world_ = await world();

    await world_.learn("qual é o endpoint?", world_.sessionId);
    const again = await world_.learn("Qual é o endpoint?  ", world_.sessionId);

    expect(again.skipped).toBe("cached");
    // A resposta vem do cache, e o agente subiu uma vez só.
    expect(again.answer).toContain("/v2/checkout");
    expect(world_.prompts).toBe(1);
  });

  it("o orçamento por sessão fecha a porta, e diz que fechou", async () => {
    const world_ = await world({ budget: 1 });

    await world_.learn("primeira pergunta diferente", world_.sessionId);
    const second = await world_.learn("segunda pergunta diferente", world_.sessionId);

    expect(second).toMatchObject({ answer: null, skipped: "over_budget" });
    expect(world_.prompts).toBe(1);
  });

  it("desligado não sobe nada", async () => {
    const world_ = await world({ enabled: false });

    expect(await world_.learn("qualquer coisa", world_.sessionId)).toMatchObject({
      skipped: "disabled",
    });
    expect(world_.prompts).toBe(0);
  });

  it("resposta fora do formato degrada, e não grava nada", async () => {
    const { learn, memory, sessionId } = await world({ answer: "acho que é /v2, mas não olhei" });

    const result = await learn("qual é o endpoint?", sessionId);

    expect(result).toMatchObject({ answer: null, skipped: "degraded" });
    expect(memory.list()).toHaveLength(0);
    expect(memory.proposals()).toHaveLength(0);
  });

  it("mede a tentativa, inclusive quando ela degrada (Q20)", async () => {
    const { learn, memory, sessionId } = await world({ answer: "prosa" });

    await learn("qual é o endpoint?", sessionId);

    const [usage] = memory.usageSummary().filter((row) => row.kind === "research");
    expect(usage?.events).toBe(1);
  });

  it("sobe a cópia gerenciada do adaptador, e não o comando gravado na linha", async () => {
    const world_ = await world();

    await world_.learn("qual é o endpoint?", world_.sessionId);

    // A linha diz `claude-agent-acp`, um nome que o PATH resolveria; o que sobe é
    // o binário que o daemon instalou no pino (ADR de 2026-09-08).
    expect(world_.spawned).toEqual([adapterBinaryPath(adaptersDir(world_.stateDir), CLAUDE_ADAPTER)]);
  });

  it("sem a cópia gerenciada, degrada em vez de cair no PATH", async () => {
    const world_ = await world({ staged: false });

    const result = await world_.learn("qual é o endpoint?", world_.sessionId);

    expect(result).toMatchObject({ answer: null, skipped: "degraded" });
    expect(world_.spawned).toEqual([]);
  });

  it("a configuração aposentada de quem perguntou não pesquisa — a primeira ativa pesquisa", async () => {
    const world_ = await world();
    const active = await createAgentConfigRepository(world_.db).create({
      name: "claude-ativo",
      command: "/opt/agentes/claude-ativo",
      adapterVersion: "1.0.0",
    });
    // A linha de quem perguntou é a que a `0033` aposentou (era `pty`).
    await world_.db
      .update(agentConfig)
      .set({ retiredAt: new Date() })
      .where(eq(agentConfig.id, world_.configId));

    await world_.learn("qual é o endpoint?", world_.sessionId);

    expect(world_.spawned).toEqual([active.command]);
  });
});
