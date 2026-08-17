import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryRejected, MemoryService } from "./MemoryService.js";
import { ensureMemoryHome } from "./home.js";

const run = promisify(execFile);
const databases: TestDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.cleanup();
  cleanupGitFixtures();
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

async function service() {
  const stateDir = join(tempDir("lumem-gate-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const db = openTestDb();
  databases.push(db);
  return { memory: new MemoryService({ db: db.db, stateDir }), stateDir };
}

const base = {
  name: "Estilo de revisão",
  description: "Achado com arquivo e linha antes do texto",
  type: "user" as const,
  actor: "human" as const,
};

describe("o portão", () => {
  it("recusa segredo, não escreve nada, e a recusa fica no WAL", async () => {
    const { memory, stateDir } = await service();

    await expect(
      memory.write({ ...base, body: "a chave é ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345" }),
    ).rejects.toBeInstanceOf(MemoryRejected);

    // Nada no disco, nada no catálogo, nada no git.
    expect(existsSync(join(stateDir, "memory/user_estilo-de-revisao.md"))).toBe(false);
    expect(memory.list()).toHaveLength(0);
    expect(await git(stateDir, "log", "--format=%s")).toBe("chore(lumem): .gitignore do daemon");

    // E a decisão existe — é a resposta para "por que isso não foi salvo?".
    const [decision] = memory.decisions();
    expect(decision?.outcome).toBe("rejected");
    expect(decision?.ruleTrace).toContain("github_token");
    expect(decision?.commitSha).toBeNull();
  });

  it("a rejeição registrada não carrega o conteúdo escaneado", async () => {
    const { memory } = await service();
    const segredo = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345";

    await expect(memory.write({ ...base, body: `token: ${segredo}` })).rejects.toThrow(
      /credencial/,
    );

    const registro = JSON.stringify(memory.decisions()[0]);
    expect(registro).not.toContain(segredo);
  });

  it("limpa Unicode invisível e grava o texto limpo", async () => {
    const { memory, stateDir } = await service();

    const result = await memory.write({ ...base, body: "vale​ para todo projeto" });

    expect(result.outcome).toBe("applied");
    const texto = readFileSync(join(stateDir, result.path), "utf8");
    expect(texto).toContain("vale para todo projeto");
    expect(texto).not.toMatch(/​/);
  });

  it("escrever duas vezes o mesmo conteúdo é no-op, e não commit vazio", async () => {
    const { memory, stateDir } = await service();
    await memory.write({ ...base, body: "Achado primeiro." });
    const antes = await git(stateDir, "rev-parse", "HEAD");

    const repetida = await memory.write({ ...base, body: "Achado primeiro." });

    expect(repetida.outcome).toBe("noop");
    expect(await git(stateDir, "rev-parse", "HEAD")).toBe(antes);
    expect(memory.decisions().filter((row) => row.outcome === "noop")).toHaveLength(1);
  });

  it("a decisão aplicada guarda o commit que produziu", async () => {
    const { memory } = await service();

    const result = await memory.write({ ...base, body: "Achado primeiro." });

    const [decision] = memory.decisions();
    expect(decision?.outcome).toBe("applied");
    expect(decision?.commitSha).toBe(result.commit);
    // Q37: o WAL guarda a decisão e o SHA. O conteúdo anterior é o commit
    // anterior, e por isso não está aqui.
    expect(Object.keys(decision ?? {})).not.toContain("priorContent");
  });

  it("anota tempo relativo sem bloquear", async () => {
    const { memory } = await service();

    const result = await memory.write({ ...base, body: "hoje o deploy é manual" });

    expect(result.outcome).toBe("applied");
    expect(memory.decisions()[0]?.ruleTrace).toContain("relative_time_pt");
  });
});

describe("revert", () => {
  it("volta ao conteúdo anterior e grava uma decisão nova", async () => {
    const { memory, stateDir } = await service();
    const first = await memory.write({ ...base, body: "primeira versão" });
    await memory.write({ ...base, body: "segunda versão" });

    const result = await memory.revert(first.path);

    expect(result.outcome).toBe("reverted");
    expect(readFileSync(join(stateDir, first.path), "utf8")).toContain("primeira versão");
    // O histórico não é reescrito: desfazer é uma escrita nova.
    const log = (await git(stateDir, "log", "--format=%s")).split("\n");
    expect(log).toHaveLength(4);
    expect(log[0]).toBe("atualiza: memory/user_estilo-de-revisao.md");
  });

  it("desfazer a criação é apagar — era ela que não existia antes", async () => {
    const { memory, stateDir } = await service();
    const created = await memory.write({ ...base, body: "única versão" });

    const result = await memory.revert(created.path);

    expect(result.outcome).toBe("deleted");
    expect(existsSync(join(stateDir, created.path))).toBe(false);
    expect(memory.list()).toHaveLength(0);
  });

  it("desfazer duas vezes alterna, e cada ponto é uma decisão própria", async () => {
    const { memory, stateDir } = await service();
    const first = await memory.write({ ...base, body: "primeira versão" });
    await memory.write({ ...base, body: "segunda versão" });

    await memory.revert(first.path);
    await memory.revert(first.path);

    // Reverter é escrita nova, então o segundo revert desfaz o primeiro — é a
    // semântica do git, e não um bug. O que a chave `revert:<path>:<sha>`
    // garante é que **o mesmo ponto** nunca vira duas decisões.
    expect(readFileSync(join(stateDir, first.path), "utf8")).toContain("segunda versão");
    const reverts = memory.decisions().filter((row) => row.idempotencyKey.startsWith("revert:"));
    expect(reverts).toHaveLength(2);
    expect(new Set(reverts.map((row) => row.idempotencyKey)).size).toBe(2);
  });

  it("caminho sem histórico responde NOT_FOUND, não estoura", async () => {
    const { memory } = await service();

    await expect(memory.revert("memory/user_inexistente.md")).rejects.toThrow(/histórico/);
  });
});
