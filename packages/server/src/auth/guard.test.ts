import type { AddressInfo } from "node:net";

import { PTY_SESSION_PARAM, PTY_WS_PATH } from "@lumem/shared";
import type { FastifyInstance } from "fastify";
import { WebSocket, type ClientOptions } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig, type ServerConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import { ensureMemoryHome } from "../memory/home.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createServer } from "../server.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * A guarda sobre HTTP de verdade e sobre o handshake de verdade.
 *
 * `origins.test.ts` prova a regra; este arquivo prova que ela está **no
 * caminho** — que é a parte que some sem ninguém notar. O teste do upgrade é o
 * que tem dentes: tirar a checagem de `ws/upgrade.ts` deixa todo o resto verde.
 */

const DEV_ORIGIN = "http://127.0.0.1:4318";

let app: FastifyInstance;
let config: ServerConfig;
let ptyManager: PtyManager;
let database: TestDb;

beforeEach(async () => {
  const stateDir = tempDir("lumem-guard-");
  await ensureMemoryHome({ stateDir });
  ptyManager = new PtyManager();
  database = openTestDb();
  config = loadConfig({ LUMEM_STATE_DIR: stateDir, LUMEM_WEB_ORIGINS: DEV_ORIGIN });
  app = await createServer({ config, db: database.db, ptyManager });
});

afterEach(async () => {
  await app.close();
  await ptyManager.killAll();
  database.cleanup();
  cleanupGitFixtures();
});

/** O `Host` que um browser mandaria para este daemon. */
function authority(hostname = "127.0.0.1"): string {
  return `${hostname}:${String(config.port)}`;
}

describe("Host", () => {
  it.each(["127.0.0.1", "localhost", "[::1]"])(
    "atende por %s na porta em que escuta",
    async (hostname) => {
      const response = await app.inject({
        method: "GET",
        url: "/trpc/health",
        headers: { host: authority(hostname) },
      });

      expect(response.statusCode).toBe(200);
    },
  );

  it("recusa com 421 o Host de outro domínio", async () => {
    /*
     * DNS rebinding, §2.1: a página continua sendo `evil.example` para o
     * browser, e é por isso que nenhuma regra de CORS se aplica — o `Host` é a
     * única coisa que denuncia.
     */
    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
      headers: { host: `evil.example:${String(config.port)}` },
    });

    expect(response.statusCode).toBe(421);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("só atende");
  });

  it("recusa a porta que não é a sua", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
      headers: { host: "127.0.0.1:1234" },
    });

    expect(response.statusCode).toBe(421);
  });

  it("recusa o default do app.inject, que é localhost:80", async () => {
    // A prova de que a checagem não tem exceção para pedido sem browser: o
    // `Host` errado é recusado venha de onde vier.
    const response = await app.inject({ method: "GET", url: "/trpc/health" });

    expect(response.statusCode).toBe(421);
  });
});

describe("Origin", () => {
  it("recusa com 403 a mutação vinda de outra origem", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: authority(), origin: "http://evil.example" },
      payload: { name: "invadido" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["content-type"]).toContain("text/plain");
  });

  it("aceita a mutação vinda da própria página do daemon", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: authority(), origin: `http://127.0.0.1:${String(config.port)}` },
      payload: { name: "pessoal" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("aceita a origem de desenvolvimento que a configuração declarou", async () => {
    // É o vite: em `pnpm dev` a página vem da outra porta, e para o browser
    // isso é outra origem.
    const response = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: authority(), origin: DEV_ORIGIN },
      payload: { name: "do vite" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("deixa passar a mutação sem sinal de browser nenhum", async () => {
    // A porta do produto, §4 F2: `curl`, o e2e pela API, o agente. Fechar isto
    // é a fase 2, com credencial.
    const response = await app.inject({
      method: "POST",
      url: "/trpc/workspace.create",
      headers: { host: authority() },
      payload: { name: "pela api" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("protege a porta do agente que muda estado", async () => {
    // `POST /tasks` é a outra porta fora do `/trpc` (`022` T12), e ela cria
    // tarefa. Ser `POST` já basta para a origem ser conferida.
    const response = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: { host: authority(), origin: "http://evil.example" },
      payload: { title: "invadido" },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("Sec-Fetch-Site", () => {
  it("recusa o GET com efeito vindo de fora", async () => {
    /*
     * §2.3: `<img src="http://127.0.0.1:4317/memory/ask?q=…">` em qualquer
     * página grava `memory_usage` e, com o auto-learn ligado, sobe um agente e
     * gasta token. O browser não manda `Origin` num `GET` desses — manda isto.
     */
    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?q=como%20fazer%20commit",
      headers: { host: authority(), "sec-fetch-site": "cross-site" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("deixa passar o GET com efeito quando não há cabeçalho nenhum", async () => {
    // O `curl` que a skill ensina. É o caminho do produto e ele não muda.
    const response = await app.inject({
      method: "GET",
      url: "/memory/ask?q=como%20fazer%20commit",
      headers: { host: authority() },
    });

    expect(response.statusCode).toBe(200);
  });

  it("deixa passar a query do tRPC vinda de outro site", async () => {
    /*
     * Deliberado, e é a decisão E3: sem CORS registrado o browser não deixa a
     * página **ler** a resposta, e uma query não muda estado. Recusar aqui
     * custaria uma checagem em todo caminho de leitura sem fechar nada.
     */
    const response = await app.inject({
      method: "GET",
      url: "/trpc/health",
      headers: { host: authority(), "sec-fetch-site": "cross-site" },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe("o handshake de WebSocket", () => {
  let baseUrl: string;

  beforeEach(async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  /** Tenta o upgrade e responde só o que interessa: subiu, ou por quê não. */
  async function connect(options: ClientOptions = {}): Promise<{ opened: boolean; error: string }> {
    const ws = new WebSocket(`${baseUrl}${PTY_WS_PATH}?${PTY_SESSION_PARAM}=inexistente`, options);
    return new Promise((resolve) => {
      ws.once("open", () => {
        ws.close();
        resolve({ opened: true, error: "" });
      });
      ws.once("error", (error: Error) => {
        resolve({ opened: false, error: error.message });
      });
    });
  }

  it("sobe quando não há sinal de browser", async () => {
    // Sessão inexistente: o socket abre e o erro vem *depois*, como protocolo.
    // O que está sob teste é o handshake.
    await expect(connect()).resolves.toMatchObject({ opened: true });
  });

  it("sobe com a origem da própria página", async () => {
    await expect(connect({ origin: baseUrl })).resolves.toMatchObject({ opened: true });
  });

  it("recusa a origem de fora antes do handshake", async () => {
    /*
     * §2.2: WebSocket não obedece CORS, então qualquer página pode abrir
     * `ws://127.0.0.1:4317/acp?session=<id>` e, se souber o id, ler a
     * transcrição inteira no `attached` e mandar `prompt`. Tirar a checagem do
     * `ws/upgrade.ts` derruba este teste e nenhum outro.
     */
    const { opened, error } = await connect({ origin: "http://evil.example" });

    expect(opened).toBe(false);
    expect(error).toContain("403");
  });

  it("recusa o Host de outro domínio antes do handshake", async () => {
    const { opened, error } = await connect({ headers: { host: "evil.example" } });

    expect(opened).toBe(false);
    expect(error).toContain("421");
  });
});
