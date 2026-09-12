import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "../db/index.js";
import { project, session, task, workspace } from "../db/schema.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { createEventBus, type LumemEvent } from "../events.js";
import { DAEMON_PREFIXES } from "../web/static.js";

import { registerTaskHttp } from "./http.js";

/**
 * A porta do agente (`022-workspace-tasks` T12 e T13).
 *
 * Texto puro e `curl`-ável, como a da memória. O que os casos abaixo provam, em
 * ordem de importância: **escrever para cima é proposta** (§3.2), o orçamento é
 * **por tarefa** e não por sessão, e a recusa diz o número — um teto que recusa
 * em silêncio é um teto que parece bug.
 */

let database: TestDb;
let app: FastifyInstance;
let db: Db;
let emitted: LumemEvent[];

beforeEach(async () => {
  database = openTestDb();
  db = database.db;
  emitted = [];
  const events = createEventBus();
  const original = events.emit.bind(events);
  events.emit = (event) => {
    emitted.push(event);
    original(event);
  };

  app = Fastify();
  registerTaskHttp({ app, db, events, budget: 2 });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  database.cleanup();
});

interface World {
  workspaceId: string;
  api: string;
  web: string;
  sessionId: string;
}

/** Um workspace com dois projetos e uma sessão viva no primeiro. */
async function world(options: { taskId?: string } = {}): Promise<World> {
  const workspaceId = newId();
  await db.insert(workspace).values({ id: workspaceId, name: "acme" });
  const api = newId();
  const web = newId();
  await db.insert(project).values([
    { id: api, workspaceId, name: "acme-api", path: `/repos/${api}`, defaultBranch: "main" },
    { id: web, workspaceId, name: "acme-web", path: `/repos/${web}`, defaultBranch: "main" },
  ]);
  const sessionId = newId();
  // `shell` e não `agent`: o CHECK do schema exige configuração para um agente,
  // e a porta não olha o `kind` — ela olha o escopo e a tarefa.
  await db.insert(session).values({
    id: sessionId,
    kind: "shell",
    scopeType: "project",
    scopeId: api,
    cwd: "/repos",
    command: "claude",
    ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
  });
  return { workspaceId, api, web, sessionId };
}

async function post(url: string, body?: Record<string, string>) {
  return body === undefined
    ? app.inject({ method: "POST", url })
    : app.inject({ method: "POST", url, payload: body });
}

describe("POST /tasks", () => {
  it("para o próprio projeto entra aberta", async () => {
    const w = await world();

    const reply = await post(`/tasks?session=${w.sessionId}`, {
      title: "consertar o /orders",
      project: "acme-api",
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toContain("tarefa criada");
    const [row] = await db.select().from(task);
    expect(row).toMatchObject({ status: "open", createdBy: "agent", createdBySession: w.sessionId });
    expect(emitted).toContainEqual({ type: "task.changed", workspaceId: w.workspaceId });
  });

  it("para outro projeto vira proposta — escrever para cima é proposta", async () => {
    const w = await world();

    const reply = await post(`/tasks?session=${w.sessionId}`, {
      title: "o checkout lê order.total",
      project: "acme-web",
    });

    expect(reply.body).toContain("proposta criada");
    const [row] = await db.select().from(task);
    expect(row).toMatchObject({ status: "proposed", projectId: w.web });
  });

  it("recusa um projeto que não é deste workspace", async () => {
    const w = await world();
    const other = newId();
    await db.insert(workspace).values({ id: other, name: "pessoal" });
    await db
      .insert(project)
      .values({ id: newId(), workspaceId: other, name: "alheio", path: "/repos/alheio", defaultBranch: "main" });

    const reply = await post(`/tasks?session=${w.sessionId}`, { title: "x", project: "alheio" });

    expect(reply.statusCode).toBe(404);
    expect(reply.body).toContain("neste workspace");
  });

  it("recusa sem sessão, e recusa uma sessão que não existe", async () => {
    await world();

    expect((await post("/tasks", { title: "x", project: "acme-api" })).statusCode).toBe(400);
    expect((await post("/tasks?session=nada", { title: "x", project: "acme-api" })).statusCode).toBe(
      404,
    );
  });
});

describe("o orçamento é por tarefa, não por sessão", () => {
  it("duas sessões da mesma tarefa dividem o mesmo bolso", async () => {
    /*
     * T8: a esteira da `028` dá três sessões a cada tarefa — implementador,
     * revisor, testador. "Cinco por sessão" viraria quinze por tarefa sem
     * ninguém ter decidido isso.
     */
    const w = await world();
    const taskId = newId();
    await db
      .insert(task)
      .values({ id: taskId, workspaceId: w.workspaceId, projectId: w.api, title: "a mãe" });
    await db.update(session).set({ taskId }).where(eq(session.id, w.sessionId));
    const second = newId();
    await db.insert(session).values({
      id: second,
      kind: "shell",
      scopeType: "project",
      scopeId: w.api,
      cwd: "/repos",
      command: "claude",
      taskId,
    });

    // Duas é o teto deste teste. A primeira sessão gasta uma…
    expect((await post(`/tasks?session=${w.sessionId}`, { title: "a", project: "acme-api" })).statusCode).toBe(200);
    // …a segunda gasta a outra…
    expect((await post(`/tasks?session=${second}`, { title: "b", project: "acme-api" })).statusCode).toBe(200);
    // …e a terceira recusa, mesmo vindo de uma sessão que não criou nenhuma.
    const refused = await post(`/tasks?session=${second}`, { title: "c", project: "acme-api" });
    expect(refused.statusCode).toBe(429);
    // A recusa diz o número: um teto que recusa em silêncio parece bug.
    expect(refused.body).toContain("2 tarefas por tarefa");
  });

  it("outra tarefa tem o bolso dela", async () => {
    // Cada tarefa com a sessão dela, que é como a esteira funciona: o bolso
    // segue a tarefa, e uma vizinha esgotada não bloqueia a seguinte.
    const w = await world();
    const first = newId();
    const second = newId();
    for (const id of [first, second]) {
      await db
        .insert(task)
        .values({ id, workspaceId: w.workspaceId, projectId: w.api, title: `mãe ${id}` });
    }
    await db.update(session).set({ taskId: first }).where(eq(session.id, w.sessionId));
    await post(`/tasks?session=${w.sessionId}`, { title: "a", project: "acme-api" });
    await post(`/tasks?session=${w.sessionId}`, { title: "b", project: "acme-api" });

    const other = newId();
    await db.insert(session).values({
      id: other,
      kind: "shell",
      scopeType: "project",
      scopeId: w.api,
      cwd: "/repos",
      command: "claude",
      taskId: second,
    });
    const reply = await post(`/tasks?session=${other}`, { title: "c", project: "acme-api" });

    expect(reply.statusCode).toBe(200);
  });

  it("conversa avulsa conta contra a própria sessão", async () => {
    // Sem isto a porta ficaria sem teto exatamente no caminho mais solto.
    const w = await world();
    await post(`/tasks?session=${w.sessionId}`, { title: "a", project: "acme-api" });
    await post(`/tasks?session=${w.sessionId}`, { title: "b", project: "acme-api" });

    const refused = await post(`/tasks?session=${w.sessionId}`, { title: "c", project: "acme-api" });

    expect(refused.statusCode).toBe(429);
  });
});

describe("POST /tasks/:id/review", () => {
  it("o agente diz review, e nunca done", async () => {
    const w = await world();
    const taskId = newId();
    await db
      .insert(task)
      .values({ id: taskId, workspaceId: w.workspaceId, projectId: w.api, title: "acho que fiz" });

    const reply = await post(`/tasks/${taskId}/review`);

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toContain("quem marca done é uma pessoa");
    const [row] = await db.select().from(task).where(eq(task.id, taskId));
    expect(row?.status).toBe("review");
  });

  it("recusa uma tarefa que não existe", async () => {
    await world();

    expect((await post("/tasks/nada/review")).statusCode).toBe(404);
  });
});

describe("a rota é do daemon, e não do servidor de arquivos", () => {
  it("`/tasks` está no DAEMON_PREFIXES", () => {
    /*
     * O daemon serve o web na própria porta desde a `014`. Sem o prefixo, a
     * rota cai no fallback da SPA e o agente recebe `<!doctype html>` onde
     * esperava texto — e o sintoma só aparece **no pacote instalado**, nunca em
     * `pnpm dev`, onde o vite serve o web em outra porta.
     */
    expect(DAEMON_PREFIXES).toContain("/tasks");
  });
});
