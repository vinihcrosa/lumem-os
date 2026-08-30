import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import { registerWeb, resolveWebRoot, wantsAppShell } from "./static.js";

let root: string;
let app: FastifyInstance;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "lumem-web-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>lumem</title>");
  writeFileSync(join(root, "assets", "index-a1b2c3.js"), "export const x = 1;\n");

  app = Fastify();
  // Stands in for the real daemon routes: the point of the fallback is that it
  // does not touch them.
  app.get("/trpc/health", async () => ({ ok: true }));
  await registerWeb({ app, root });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

describe("resolveWebRoot", () => {
  it("aceita um diretório que tem index.html", () => {
    expect(resolveWebRoot(root)).toBe(root);
  });

  it("recusa um diretório sem index.html", () => {
    const empty = mkdtempSync(join(tmpdir(), "lumem-empty-"));
    try {
      expect(resolveWebRoot(empty)).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("rodando do código-fonte, não acha web nenhum", () => {
    // Development: vite is serving. A daemon that found something here would be
    // serving TypeScript source as if it were the product.
    expect(resolveWebRoot()).toBeNull();
  });
});

describe("o web servido pelo daemon", () => {
  it("serve o index na raiz, sem cache", async () => {
    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("serve o asset com o MIME certo e cache longo", async () => {
    const response = await app.inject({ method: "GET", url: "/assets/index-a1b2c3.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("javascript");
    expect(response.headers["cache-control"]).toContain("immutable");
  });

  it("devolve o index para uma rota da aplicação", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workspace/w1/worktree/t2",
      headers: { accept: "text/html" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<title>lumem</title>");
  });

  it("não engole as rotas do daemon", async () => {
    // The whole product breaks quietly if this fails: the client asks for JSON
    // and gets the app shell, then reports a parse error instead of the 404.
    for (const url of ["/trpc/session.get", "/memory/ask", "/pty", "/acp/x"]) {
      const response = await app.inject({ method: "GET", url, headers: { accept: "text/html" } });

      expect(response.statusCode, url).toBe(404);
      expect(response.body, url).not.toContain("<title>lumem</title>");
    }
  });

  it("não inventa HTML para um asset que não existe", async () => {
    const response = await app.inject({ method: "GET", url: "/assets/sumiu.js" });

    expect(response.statusCode).toBe(404);
  });

  it("continua respondendo as rotas registradas antes dele", async () => {
    const response = await app.inject({ method: "GET", url: "/trpc/health" });

    expect(response.statusCode).toBe(200);
  });
});

describe("wantsAppShell", () => {
  it("recusa método que não é leitura", () => {
    expect(
      wantsAppShell({ method: "POST", url: "/workspace/w1", headers: { accept: "text/html" } }),
    ).toBe(false);
  });

  it("ignora a query string ao procurar extensão", () => {
    expect(wantsAppShell({ method: "GET", url: "/workspace/w1?tab=diff", headers: {} })).toBe(true);
    expect(wantsAppShell({ method: "GET", url: "/a/b.js?v=2", headers: {} })).toBe(false);
  });
});
