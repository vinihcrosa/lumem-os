import { join } from "node:path";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createServer } from "../server.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { ensureMemoryHome } from "./home.js";

const databases: TestDb[] = [];
const apps: FastifyInstance[] = [];
const ptys: PtyManager[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const pty of ptys.splice(0)) await pty.killAll();
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

async function daemon(): Promise<{ app: FastifyInstance; memory: MemoryService }> {
  const stateDir = join(tempDir("lumem-ask-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const database = openTestDb();
  databases.push(database);
  const ptyManager = new PtyManager();
  ptys.push(ptyManager);
  const app = await createServer({
    config: loadConfig({ LUMEM_STATE_DIR: stateDir }),
    db: database.db,
    ptyManager,
  });
  apps.push(app);
  return { app, memory: new MemoryService({ db: database.db, stateDir }) };
}

describe("GET /memory/ask", () => {
  it("responde com o corpo da memória e cita a fonte", async () => {
    const { app, memory } = await daemon();
    await memory.write({
      name: "Commit neste workspace",
      description: "Conventional Commits, com escopo",
      type: "process",
      scope: "global",
      body: "Commit sempre em inglês, com escopo entre parênteses.",
      actor: "human",
    });

    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?q=" + encodeURIComponent("como fazer commit neste workspace"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("Commit sempre em inglês");
    // A fonte junto da resposta (§5.5): sem o caminho, não há como conferir.
    expect(response.body).toContain("memory/process_commit-neste-workspace.md");
  });

  it("não sei é resposta, e diz que o acervo tem buraco ali", async () => {
    const { app } = await daemon();

    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?q=" + encodeURIComponent("qual é a política de retry do checkout"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("não sei");
  });

  it("pergunta trivial diz que não buscou, e não que não achou", async () => {
    const { app } = await daemon();

    const response = await app.inject({ method: "GET", url: "/memory/ask?q=a" });

    expect(response.body).toContain("muito curta");
  });

  it("sem pergunta, recusa dizendo o que faltou", async () => {
    const { app } = await daemon();

    const response = await app.inject({ method: "GET", url: "/memory/ask" });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("?q=");
  });

  it("sessão que não existe não derruba a pergunta: sobra o escopo global", async () => {
    const { app, memory } = await daemon();
    await memory.write({
      name: "Estilo de revisão",
      description: "Achado com arquivo e linha antes do texto",
      type: "user",
      body: "Achado primeiro, explicação depois.",
      actor: "human",
    });

    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?session=ses_fantasma&q=" + encodeURIComponent("estilo de revisão de código"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Achado primeiro");
  });
});
