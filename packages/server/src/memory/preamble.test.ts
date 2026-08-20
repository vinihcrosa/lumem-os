import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createWorkspaceRepository } from "../repositories/workspace.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { ensureMemoryHome } from "./home.js";
import { createMemoryPreamble } from "./preamble.js";

const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

const ASK = "http://127.0.0.1:4317/memory/ask";

async function world(): Promise<{
  memory: MemoryService;
  preamble: ReturnType<typeof createMemoryPreamble>;
  sessionId: string;
  workspaceId: string;
  projectId: string;
}> {
  const stateDir = join(tempDir("lumem-preamble-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const database = openTestDb();
  databases.push(database);
  const db = database.db;

  const workspace = await createWorkspaceRepository(db).create({ name: "pessoal" });
  const project = await createProjectRepository(db).create({
    workspaceId: workspace.id,
    name: "lorebase",
    path: "/repos/lorebase",
    defaultBranch: "main",
  });
  const agent = await createAgentConfigRepository(db).create({
    name: "claude",
    command: "claude-agent-acp",
    transport: "acp",
    adapterVersion: "0.40.0",
  });
  const session = await createSessionRepository(db).create({
    id: "ses_1",
    kind: "agent",
    agentConfigId: agent.id,
    scopeType: "project",
    scopeId: project.id,
    cwd: project.path,
    command: "claude-agent-acp",
    transport: "acp",
    acpSessionId: "acp_1",
  });

  return {
    memory: new MemoryService({ db, stateDir }),
    preamble: createMemoryPreamble({ db, stateDir, askUrl: ASK }),
    sessionId: session.id,
    workspaceId: workspace.id,
    projectId: project.id,
  };
}

const info = (id: string) =>
  ({
    id,
    command: "claude-agent-acp",
    args: [],
    cwd: "/repos/lorebase",
    state: "running",
  }) as never;

describe("createMemoryPreamble", () => {
  it("acervo vazio não injeta bloco: não existe porta para apontar", async () => {
    const { preamble, sessionId } = await world();

    expect(await preamble(info(sessionId))).toBeNull();
  });

  it("com memória mas nada fixado, a diretiva e a skill valem — a porta existe", async () => {
    const { preamble, memory, sessionId } = await world();
    await memory.write({
      name: "Endpoint de checkout",
      description: "explicação, não diretriz",
      type: "reference",
      scope: "global",
      body: "POST /v2/checkout",
      actor: "human",
    });

    const result = await preamble(info(sessionId));

    expect(result?.entries).toBe(0);
    expect(result?.text).toContain("Consultá-la é obrigatório");
    expect(result?.text).toContain(ASK);
    // O corpo da memória não fixada **não** entra: ela fica a uma pergunta.
    expect(result?.text).not.toContain("POST /v2/checkout");
  });

  it("as três camadas, na ordem: diretiva, núcleo, skill", async () => {
    const { preamble, memory, sessionId } = await world();
    const written = await memory.write({
      name: "Commit neste workspace",
      description: "Conventional Commits",
      type: "process",
      scope: "global",
      body: "Commit em inglês, com escopo.",
      actor: "human",
    });
    await memory.pin(written.path, true);

    const result = await preamble(info(sessionId));

    expect(result?.entries).toBe(1);
    const text = result?.text ?? "";
    expect(text.indexOf("obrigatório")).toBeLessThan(text.indexOf("Commit em inglês"));
    expect(text.indexOf("Commit em inglês")).toBeLessThan(text.indexOf("Como consultar"));
  });

  it("a worktree herda o projeto dela, e o mapa é do workspace da sessão", async () => {
    const { preamble, memory, sessionId, workspaceId, projectId } = await world();
    const written = await memory.write({
      name: "Migration",
      description: "antes de mexer, pergunte",
      type: "process",
      scope: "project",
      workspaceId,
      projectId,
      body: "Antes de mexer em migration, pergunte.",
      actor: "human",
    });
    await memory.pin(written.path, true);

    const result = await preamble(info(sessionId));

    // Memória de escopo de projeto chega numa sessão do projeto.
    expect(result?.text).toContain("Antes de mexer em migration");
    // E o mapa nomeia os projetos do workspace, que é o anticorpo do §5.1.
    expect(result?.text).toContain("lorebase");
  });
});
