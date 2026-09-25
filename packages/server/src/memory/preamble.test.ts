import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createProjectRepository } from "../repositories/project.js";
import { createSessionRepository } from "../repositories/session.js";
import { createTaskRepository } from "../repositories/task.js";
import { session } from "../db/schema.js";
import { eq } from "drizzle-orm";
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
  withReview: ReturnType<typeof createMemoryPreamble>;
  db: ReturnType<typeof openTestDb>["db"];
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
    // A mesma fábrica, com a porta do parecer ligada (`028` Parte 7).
    withReview: createMemoryPreamble({
      db,
      stateDir,
      askUrl: ASK,
      reviewBaseUrl: "http://127.0.0.1:4317/tasks",
    }),
    db,
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
    const { preamble, memory, sessionId, workspaceId } = await world();
    await memory.write({
      name: "Endpoint de checkout",
      description: "explicação, não diretriz",
      type: "reference",
      scope: "workspace",
      workspaceId,
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

describe("a porta do parecer não viaja dentro da memória (Parte 7)", () => {
  /** Uma tarefa na etapa dada, com a sessão ligada a ela. */
  async function serving(
    db: ReturnType<typeof openTestDb>["db"],
    ids: { workspaceId: string; projectId: string; sessionId: string },
    status: string,
  ) {
    const created = await createTaskRepository(db).create({
      workspaceId: ids.workspaceId,
      projectId: ids.projectId,
      title: "o /orders devolve 500",
    });
    if (status !== "open") {
      await createTaskRepository(db).setStatus(created.id, status as "review", { actor: "human" });
    }
    await db.update(session).set({ taskId: created.id }).where(eq(session.id, ids.sessionId));
    return created.id;
  }

  it("com memória vazia, o revisor ainda recebe a porta", async () => {
    /*
     * **É o defeito que quase foi para produção.** A porta viajava dentro do
     * preâmbulo de memória, e ele devolve `null` quando o acervo está vazio —
     * que é o estado de **todo workspace novo**. O revisor escreveria o parecer
     * na conversa, como antes, e o portão não leria nada.
     */
    const world_ = await world();
    const taskId = await serving(world_.db, world_, "review");

    const result = await world_.withReview(info(world_.sessionId));

    expect(result).not.toBeNull();
    expect(result?.text).toContain(`/tasks/${taskId}/findings`);
    // E a diretiva de memória **sai**: ela manda consultar um acervo que não
    // existe.
    expect(result?.text).not.toContain("Como consultar a memória");
  });

  it("fora da etapa de revisão, a porta não aparece — nem com memória", async () => {
    // Um parágrafo sobre como reprovar numa conversa de implementação é custo em
    // toda sessão para instruir ninguém.
    const world_ = await world();
    await serving(world_.db, world_, "in_progress");
    await world_.memory.write({
      name: "Endpoint de checkout",
      description: "explicação",
      type: "reference",
      scope: "workspace",
      workspaceId: world_.workspaceId,
      body: "POST /v2/checkout",
      actor: "human",
    });

    expect((await world_.withReview(info(world_.sessionId)))?.text).not.toContain("findings");
  });

  it("sem tarefa nenhuma, a sessão continua sem preâmbulo", async () => {
    const world_ = await world();

    expect(await world_.withReview(info(world_.sessionId))).toBeNull();
  });
});
