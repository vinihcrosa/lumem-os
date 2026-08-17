import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { ensureMemoryHome } from "./home.js";
import { memoryDirFor, entryPathFor, repoRelative } from "./paths.js";
import { commitChange } from "./repo.js";

const run = promisify(execFile);

afterEach(() => {
  cleanupGitFixtures();
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

async function home(): Promise<string> {
  const stateDir = join(tempDir("lumem-repo-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  return stateDir;
}

/** Escreve uma memória de mentira no lugar certo e devolve o caminho relativo. */
function writeEntry(stateDir: string, slug: string, content = "conteúdo\n"): string {
  const path = entryPathFor(stateDir, { scope: "global" }, "user", slug);
  mkdirSync(memoryDirFor(stateDir, { scope: "global" }), { recursive: true });
  writeFileSync(path, content);
  return repoRelative(stateDir, path);
}

describe("commitChange", () => {
  it("commita o que a operação tocou, com mensagem legível", async () => {
    const stateDir = await home();
    const path = writeEntry(stateDir, "estilo-de-revisao");

    const result = await commitChange({
      stateDir,
      paths: [path],
      operation: "add",
      subject: "user/estilo-de-revisao",
      actor: "human",
    });

    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await git(stateDir, "log", "-1", "--format=%s")).toBe("aprende: user/estilo-de-revisao");
    expect(await git(stateDir, "log", "-1", "--format=%b")).toContain("Origem: human");
    expect(await git(stateDir, "show", "--name-only", "--format=", "HEAD")).toBe(path);
  });

  it("não arrasta o que não é da operação", async () => {
    const stateDir = await home();
    const path = writeEntry(stateDir, "primeira");
    writeEntry(stateDir, "outra-em-voo");
    writeFileSync(join(stateDir, "memory", "rascunho.md"), "meu rascunho\n");

    await commitChange({
      stateDir,
      paths: [path],
      operation: "add",
      subject: "user/primeira",
      actor: "human",
    });

    // `git add <paths>`, nunca `-A`: o ~/.lumem é um diretório vivo.
    const committed = await git(stateDir, "show", "--name-only", "--format=", "HEAD");
    expect(committed).toBe(path);
    const pending = await git(stateDir, "status", "--porcelain", "-uall");
    expect(pending).toContain("outra-em-voo");
    expect(pending).toContain("rascunho.md");
  });

  it("registra a remoção de um arquivo apagado", async () => {
    const stateDir = await home();
    const path = writeEntry(stateDir, "temporaria");
    await commitChange({
      stateDir,
      paths: [path],
      operation: "add",
      subject: "user/temporaria",
      actor: "human",
    });
    rmSync(join(stateDir, path));

    const result = await commitChange({
      stateDir,
      paths: [path],
      operation: "delete",
      subject: "user/temporaria",
      actor: "human",
    });

    expect(result.commit).not.toBeNull();
    expect(await git(stateDir, "log", "-1", "--format=%s")).toBe("esquece: user/temporaria");
    // O arquivo saiu da árvore, e o histórico continua sabendo que ele existiu.
    expect(await git(stateDir, "log", "--format=%s", "--", path)).toContain(
      "aprende: user/temporaria",
    );
  });

  it("não inventa commit quando nada mudou", async () => {
    const stateDir = await home();
    const path = writeEntry(stateDir, "estavel");
    await commitChange({
      stateDir,
      paths: [path],
      operation: "add",
      subject: "user/estavel",
      actor: "human",
    });

    const again = await commitChange({
      stateDir,
      paths: [path],
      operation: "update",
      subject: "user/estavel",
      actor: "human",
    });

    expect(again.commit).toBeNull();
    expect(again.skipped).toBe("nothing-to-commit");
  });

  it("falha de git não desfaz a escrita — e não fica em silêncio", async () => {
    const stateDir = await home();
    const path = writeEntry(stateDir, "sobrevivente");
    // Impede o commit sem impedir a escrita: o índice do git vira ilegível.
    const gitDir = join(stateDir, ".git");
    chmodSync(gitDir, 0o500);
    const warn = vi.fn();

    try {
      const result = await commitChange({
        stateDir,
        paths: [path],
        operation: "add",
        subject: "user/sobrevivente",
        actor: "human",
        log: { warn },
      });

      expect(result.commit).toBeNull();
      expect(result.skipped).toBe("git-failed");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      chmodSync(gitDir, 0o700);
    }

    // O que importa: a memória continua no disco. O histórico é serviço prestado
    // ao dado, não o contrário.
    expect(await git(stateDir, "status", "--porcelain", "-uall")).toContain(path);
  });
});

describe("memoryDirFor", () => {
  it("cada escopo no seu lugar", () => {
    const root = "/tmp/lumem";

    expect(memoryDirFor(root, { scope: "global" })).toBe("/tmp/lumem/memory");
    expect(memoryDirFor(root, { scope: "workspace", workspaceId: "ws1" })).toBe(
      "/tmp/lumem/workspaces/ws1/memory",
    );
    expect(memoryDirFor(root, { scope: "project", workspaceId: "ws1", projectId: "p1" })).toBe(
      "/tmp/lumem/workspaces/ws1/projects/p1/memory",
    );
  });

  it("exige o que o escopo precisa", () => {
    expect(() => memoryDirFor("/tmp/lumem", { scope: "workspace" })).toThrow(/workspaceId/);
    expect(() => memoryDirFor("/tmp/lumem", { scope: "project", workspaceId: "ws1" })).toThrow(
      /projectId/,
    );
  });

  it("recusa id que é caminho disfarçado", () => {
    expect(() => memoryDirFor("/tmp/lumem", { scope: "workspace", workspaceId: "../fora" })).toThrow(
      /inválido/,
    );
    expect(() => memoryDirFor("/tmp/lumem", { scope: "workspace", workspaceId: ".." })).toThrow(
      /inválido/,
    );
  });
});

describe("repoRelative", () => {
  it("devolve caminho com barra, do jeito que o git fala", () => {
    expect(repoRelative("/tmp/lumem", "/tmp/lumem/memory/user_x.md")).toBe("memory/user_x.md");
  });

  it("recusa caminho fora do state dir", () => {
    expect(() => repoRelative("/tmp/lumem", "/tmp/outro/user_x.md")).toThrow(/fora do state dir/);
  });
});
