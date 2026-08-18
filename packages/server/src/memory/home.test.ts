import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";
import {
  GITIGNORE_BEGIN,
  GITIGNORE_END,
  MEMORY_HOME_DIRS,
  MEMORY_HOME_GITIGNORE_BLOCK,
  ensureMemoryHome,
  gitignoreWith,
} from "./home.js";

const run = promisify(execFile);

/** `mkdir -p` que devolve o caminho, para caber numa linha de arranjo. */
function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

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

/**
 * A função que decide o conteúdo do `.gitignore`, testada direto.
 *
 * Pelos quatro ramos, e não só pelo boot: o ramo que faltava — marcador de
 * abertura sem fechamento — só aparecia **dois boots** depois, quando o órfão
 * deixado no topo virava o `begin` da passagem seguinte e o `slice` apagava
 * tudo entre ele e o bloco recém-anexado. O daemon apagava regra do usuário e
 * commitava a remoção.
 */
describe("gitignoreWith", () => {
  const contando = (text: string, marker: string): number =>
    text.split("\n").filter((line) => line === marker).length;

  /** Um bloco íntegro entre linhas do usuário — o arquivo de quem já bootou. */
  const integro = `node_modules/\n*.log\n\n${MEMORY_HOME_GITIGNORE_BLOCK}\n\n# depois do bloco\n*.tmp\n`;
  /** Alguém apagou o fechamento à mão, ou um boot antigo deixou o órfão. */
  const abertaSemFechar = `${GITIGNORE_BEGIN}\nlumem.db\n\n# regra preciosa\n*.local\n`;
  /** O inverso: fechamento sem abertura. */
  const fechadaSemAbrir = `# regra preciosa\n*.local\n${GITIGNORE_END}\n`;

  it("arquivo ausente ou vazio recebe só o bloco", () => {
    expect(gitignoreWith(null)).toBe(`${MEMORY_HOME_GITIGNORE_BLOCK}\n`);
    expect(gitignoreWith("")).toBe(`${MEMORY_HOME_GITIGNORE_BLOCK}\n`);
    expect(gitignoreWith("\n\n")).toBe(`${MEMORY_HOME_GITIGNORE_BLOCK}\n`);
  });

  it("bloco íntegro é substituído no lugar, e o resto do arquivo fica", () => {
    const result = gitignoreWith(integro);

    expect(result).toContain(MEMORY_HOME_GITIGNORE_BLOCK);
    expect(result).toContain("node_modules/");
    expect(result).toContain("# depois do bloco");
    expect(result).toContain("*.tmp");
    expect(contando(result, GITIGNORE_BEGIN)).toBe(1);
    // A ordem do usuário é preservada: em `.gitignore` ordem tem semântica.
    expect(result.indexOf("node_modules/")).toBeLessThan(result.indexOf(GITIGNORE_BEGIN));
    expect(result.indexOf("# depois do bloco")).toBeGreaterThan(result.indexOf(GITIGNORE_END));
  });

  it("abertura órfã não engole o que vem depois dela", () => {
    const result = gitignoreWith(abertaSemFechar);

    // A regra do usuário estava **depois** do marcador sem par. Adivinhar que o
    // bloco ia até o fim do arquivo custaria exatamente ela.
    expect(result).toContain("# regra preciosa");
    expect(result).toContain("*.local");
    expect(contando(result, GITIGNORE_BEGIN)).toBe(1);
    expect(contando(result, GITIGNORE_END)).toBe(1);
    expect(result).toContain(MEMORY_HOME_GITIGNORE_BLOCK);
  });

  it("fechamento órfão também não sobrevive à passagem", () => {
    const result = gitignoreWith(fechadaSemAbrir);

    expect(result).toContain("# regra preciosa");
    expect(result).toContain("*.local");
    expect(contando(result, GITIGNORE_BEGIN)).toBe(1);
    expect(contando(result, GITIGNORE_END)).toBe(1);
  });

  it("é idempotente em todos os ramos — aplicar sobre a própria saída não muda nada", () => {
    for (const entrada of [null, "", "node_modules/\n", integro, abertaSemFechar, fechadaSemAbrir]) {
      const uma = gitignoreWith(entrada);

      // É esta propriedade, e não a inspeção do texto, que impede o defeito de
      // voltar: um órfão que sobrevive à primeira passagem muda a segunda.
      expect(gitignoreWith(uma), `não é idempotente para ${JSON.stringify(entrada)}`).toBe(uma);
    }
  });
});

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

  it("repõe o bloco do daemon que alguém apagou, e preserva o resto do arquivo", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await ensureMemoryHome({ stateDir });
    writeFileSync(join(stateDir, ".gitignore"), "# regra minha\n*.local\n");

    const result = await ensureMemoryHome({ stateDir });

    const text = readFileSync(join(stateDir, ".gitignore"), "utf8");
    // O bloco do daemon volta; o que era do usuário continua lá. Adotar é
    // adotar o que estava no diretório, e não reescrever por cima (P3).
    expect(text).toContain(MEMORY_HOME_GITIGNORE_BLOCK);
    expect(text).toContain("# regra minha");
    expect(text).toContain("*.local");
    expect(result.committed).toBe(true);
  });

  it("não toca no .gitignore do usuário além do próprio bloco", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await git(ensureDir(stateDir), "init", "-b", "main");
    writeFileSync(join(stateDir, ".gitignore"), "node_modules/\n*.log\n");

    await ensureMemoryHome({ stateDir });
    const first = readFileSync(join(stateDir, ".gitignore"), "utf8");
    await ensureMemoryHome({ stateDir });
    const second = readFileSync(join(stateDir, ".gitignore"), "utf8");

    expect(first.startsWith("node_modules/\n*.log\n")).toBe(true);
    expect(first).toContain(MEMORY_HOME_GITIGNORE_BLOCK);
    // Idempotente: o segundo boot não empilha um bloco novo.
    expect(second).toBe(first);
    expect(second.match(/# >>> lumem/g)).toHaveLength(1);
  });

  /**
   * Dois boots sobre um `.gitignore` com marcador órfão — o caso que apagava
   * regra do usuário **e commitava a remoção**.
   *
   * Boot 1 anexava um bloco novo e deixava o `BEGIN` órfão no topo; no boot 2 o
   * `begin` achava o órfão, o `end` achava o fechamento do bloco anexado, e o
   * `slice` levava tudo que estava no meio.
   */
  it("dois boots seguidos não comem a regra do usuário deixada sob marcador órfão", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await git(ensureDir(stateDir), "init", "-b", "main");
    writeFileSync(
      join(stateDir, ".gitignore"),
      `${MEMORY_HOME_GITIGNORE_BLOCK.split("\n")[0]}\nlumem.db\n\n# regra preciosa\n*.local\n`,
    );

    const primeiro = await ensureMemoryHome({ stateDir });
    const depoisDoPrimeiro = readFileSync(join(stateDir, ".gitignore"), "utf8");
    const segundo = await ensureMemoryHome({ stateDir });

    const texto = readFileSync(join(stateDir, ".gitignore"), "utf8");
    expect(primeiro.committed).toBe(true);
    expect(texto).toContain("# regra preciosa");
    expect(texto).toContain("*.local");
    expect(await ignoredIn(stateDir, "qualquer.local")).toBe(true);
    // Nada mudou no segundo boot, então não há o que commitar: o daemon não
    // reescreve o histórico do usuário com uma remoção que ele mesmo causou.
    expect(texto).toBe(depoisDoPrimeiro);
    expect(segundo.committed).toBe(false);
    expect(await commitCount(stateDir)).toBe(1);
  });

  /**
   * O clone do caso que `repo.test.ts` já cobre para `commitChange`: sem o
   * pathspec no **`commit`**, o `git add` que o usuário deixou pendente entra
   * de carona no commit do daemon. O `add -- .gitignore` sozinho não protege
   * nada aqui — o que estava no índice já estava no índice.
   */
  it("não leva no commit do .gitignore o que o usuário já tinha no índice", async () => {
    const stateDir = join(tempDir("lumem-home-"), ".lumem");
    await git(ensureDir(stateDir), "init", "-b", "main");
    writeFileSync(join(stateDir, "anotacao-do-usuario.md"), "minha anotação\n");
    await git(stateDir, "add", "anotacao-do-usuario.md");

    await ensureMemoryHome({ stateDir });

    expect(await git(stateDir, "show", "--name-only", "--format=", "HEAD")).toBe(".gitignore");
    // E continua no índice, esperando o commit que é do usuário.
    expect(await git(stateDir, "diff", "--cached", "--name-only")).toBe("anotacao-do-usuario.md");
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
