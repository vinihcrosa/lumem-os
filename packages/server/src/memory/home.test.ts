import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import { MEMORY_HOME_DIRS, MEMORY_HOME_GITIGNORE, ensureMemoryHome } from "./home.js";

const run = promisify(execFile);

/**
 * A real repository in a real directory.
 *
 * The policy in `docs/project/testing.md` — git is never mocked — applies with
 * force here: what is under test is precisely how git behaves in a directory
 * that may or may not already be one, on a machine that may or may not have an
 * identity configured. A double would answer whatever this module assumes.
 */

afterEach(() => {
  cleanupGitFixtures();
});

/**
 * git, with the global configuration taken away.
 *
 * This is the assertion that matters most in this file: the daemon must be able
 * to commit on a machine with no `user.name` — CI is exactly that machine, and
 * so is a fresh laptop. `GIT_CONFIG_GLOBAL=/dev/null` reproduces it.
 */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

async function ignoredIn(dir: string, path: string): Promise<boolean> {
  try {
    await git(dir, "check-ignore", "-q", path);
    return true;
  } catch {
    return false;
  }
}

async function commitCount(dir: string): Promise<number> {
  return Number.parseInt(await git(dir, "rev-list", "--count", "HEAD"), 10);
}

describe("ensureMemoryHome", () => {
  it("cria a estrutura de diretórios num state dir vazio", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");

    await ensureMemoryHome({ stateDir });

    for (const dir of MEMORY_HOME_DIRS) {
      expect(existsSync(join(stateDir, dir)), `${dir} deveria existir`).toBe(true);
    }
  });

  it("cria o diretório com permissão 0700 — é conhecimento do usuário, não do mundo", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");

    await ensureMemoryHome({ stateDir });

    // eslint-disable-next-line no-bitwise -- os bits de permissão são bits.
    expect(statSync(stateDir).mode & 0o777).toBe(0o700);
  });

  it("inicializa um repositório git e commita o .gitignore", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");

    const result = await ensureMemoryHome({ stateDir });

    expect(result.repository).toBe("created");
    expect(await commitCount(stateDir)).toBe(1);
    expect(await git(stateDir, "show", "--name-only", "--format=", "HEAD")).toContain(".gitignore");
  });

  it("commita sem depender de identidade global de git", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");

    await ensureMemoryHome({ stateDir });

    // Se o commit dependesse de `user.name` global, o `git` acima — que roda com
    // GIT_CONFIG_GLOBAL=/dev/null — nem conseguiria ler este commit de volta.
    expect(await git(stateDir, "log", "-1", "--format=%an")).toBe("Lumem");
  });

  it("ignora o que é derivado, e nunca o que é fonte da verdade", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await ensureMemoryHome({ stateDir });

    const ignored = (path: string): Promise<boolean> => ignoredIn(stateDir, path);

    expect(await ignored("lumem.db")).toBe(true);
    expect(await ignored("lumem.db-wal")).toBe(true);
    expect(await ignored("context/sessao.md")).toBe(true);
    expect(await ignored("_system/inbox/bruta.jsonl")).toBe(true);
    // Worktrees gerenciadas vivem aqui desde o walking-skeleton, e são checkouts
    // git inteiros: versioná-las seria aninhar repositório dentro de repositório.
    expect(await ignored("worktrees/projeto/branch")).toBe(true);

    expect(await ignored("memory/user_estilo.md")).toBe(false);
    expect(await ignored("workspaces/ws1/memory/domain_plano.md")).toBe(false);
  });

  it("é idempotente: o segundo boot não cria commit nenhum", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await ensureMemoryHome({ stateDir });
    const head = await git(stateDir, "rev-parse", "HEAD");

    const result = await ensureMemoryHome({ stateDir });

    expect(result.repository).toBe("adopted");
    expect(result.committed).toBe(false);
    expect(await git(stateDir, "rev-parse", "HEAD")).toBe(head);
    expect(await commitCount(stateDir)).toBe(1);
  });

  it("adota um repositório que já existe, sem reinicializar nem perder histórico", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    await git(stateDir, "init", "-b", "main");
    writeFileSync(join(stateDir, "anterior.md"), "escrito antes do Lumem\n");
    await git(stateDir, "add", "anterior.md");
    await git(
      stateDir,
      "-c",
      "user.name=Alguem",
      "-c",
      "user.email=alguem@local",
      "commit",
      "-m",
      "commit anterior",
    );
    const anterior = await git(stateDir, "rev-parse", "HEAD");

    const result = await ensureMemoryHome({ stateDir });

    expect(result.repository).toBe("adopted");
    // O commit de antes continua sendo ancestral: nada foi reinicializado.
    expect(await git(stateDir, "rev-list", "HEAD")).toContain(anterior);
    expect(existsSync(join(stateDir, "anterior.md"))).toBe(true);
  });

  it("cria repositório próprio quando o state dir está dentro de outro repositório", async () => {
    // O caso que o e2e encontrou: `LUMEM_STATE_DIR` apontando para dentro da
    // árvore de outro repositório — e ainda por cima para um caminho que o
    // `.gitignore` de cima ignora. Sem repositório próprio, o `git add` do
    // daemon morre com "paths are ignored by one of your .gitignore files".
    const outer = tempDir("lumem-outer-");
    await git(outer, "init", "-b", "main");
    writeFileSync(join(outer, ".gitignore"), ".lumem-dentro/\n");
    const stateDir = join(outer, ".lumem-dentro");

    const result = await ensureMemoryHome({ stateDir });

    expect(result.repository).toBe("created");
    expect(existsSync(join(stateDir, ".git"))).toBe(true);
    // O `--show-toplevel` visto de dentro tem que ser o próprio state dir, e não
    // o repositório de fora.
    expect(await realpathSync(await git(stateDir, "rev-parse", "--show-toplevel"))).toBe(
      realpathSync(stateDir),
    );
    expect(await commitCount(stateDir)).toBe(1);
  });

  it("não commita o que o usuário deixou pendente ao escrever o .gitignore", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await ensureMemoryHome({ stateDir });
    writeFileSync(join(stateDir, "memory", "rascunho.md"), "meu rascunho\n");

    await ensureMemoryHome({ stateDir });

    // `git add .gitignore`, nunca `git add -A`: o que não é da operação não entra.
    // `-uall` porque sem ele o git colapsa o diretório inteiro em `?? memory/`,
    // e a asserção passaria a falar de outra coisa.
    expect(await git(stateDir, "status", "--porcelain", "-uall")).toContain("memory/rascunho.md");
    expect(await commitCount(stateDir)).toBe(1);
  });

  it("conserta o .gitignore que alguém editou, e não inventa commit por isso", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await ensureMemoryHome({ stateDir });
    writeFileSync(join(stateDir, ".gitignore"), "# alguém apagou tudo\n");

    const result = await ensureMemoryHome({ stateDir });

    // O arquivo volta ao que o daemon escreve — e aí ele é idêntico ao que já
    // está no HEAD. Commitar aqui seria commit vazio.
    expect(readFileSync(join(stateDir, ".gitignore"), "utf8")).toBe(MEMORY_HOME_GITIGNORE);
    expect(result.committed).toBe(false);
    expect(await commitCount(stateDir)).toBe(1);
  });

  it("commita quando o .gitignore commitado está desatualizado", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await ensureMemoryHome({ stateDir });
    // Simula um `.gitignore` escrito por uma versão anterior do daemon: divergente
    // **e** commitado. É o caso em que a correção precisa virar histórico.
    writeFileSync(join(stateDir, ".gitignore"), "lumem.db\n");
    await git(stateDir, "add", ".gitignore");
    await git(
      stateDir,
      "-c",
      "user.name=Lumem Antigo",
      "-c",
      "user.email=antigo@local",
      "commit",
      "-m",
      "gitignore de uma versão anterior",
    );

    const result = await ensureMemoryHome({ stateDir });

    expect(result.committed).toBe(true);
    expect(await commitCount(stateDir)).toBe(3);
    expect(await ignoredIn(stateDir, "worktrees/projeto/branch")).toBe(true);
  });
});
