import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { runMemoryCli } from "./cli.js";

const run = promisify(execFile);

afterEach(() => {
  cleanupGitFixtures();
});

/**
 * O ciclo inteiro pela linha de comando, contra um HOME de teste.
 *
 * É literalmente o `Done when` da T7 — e a razão de a CLI receber `env`, `out` e
 * `err` por parâmetro: um teste que precisa mexer em `process.env` global é um
 * teste que os outros pagam.
 */
function cli() {
  const stateDir = join(tempDir("lumem-cli-"), ".lumem");
  const env = { LUMEM_STATE_DIR: stateDir, LUMEM_DB_PATH: join(stateDir, "lumem.db") };
  let out = "";
  let err = "";

  return {
    stateDir,
    get out() {
      return out;
    },
    get err() {
      return err;
    },
    run: (...argv: string[]) =>
      runMemoryCli(argv, {
        env,
        out: (text) => {
          out += text;
        },
        err: (text) => {
          err += text;
        },
      }),
  };
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

describe("lumem-memory", () => {
  it("escreve, lê, lista e reindexa — e o git log conta a história", async () => {
    const app = cli();

    expect(
      await app.run("write", "--name", "Estilo de revisão", "--type", "user", "--body", "Achado primeiro."),
    ).toBe(0);
    expect(
      await app.run(
        "write",
        "--name",
        "Contrato de checkout",
        "--type",
        "contract",
        "--workspace",
        "ws1",
        "--body",
        "O corpo tem itens e cupom.",
      ),
    ).toBe(0);

    expect(await app.run("read", "--name", "Estilo de revisão", "--type", "user")).toBe(0);
    expect(app.out).toContain("Achado primeiro.");

    expect(await app.run("list")).toBe(0);
    expect(app.out).toContain("global    user      Estilo de revisão");
    expect(app.out).toContain("workspace contract  Contrato de checkout");

    expect(await app.run("reindex")).toBe(0);
    expect(app.out).toContain("indexadas: 2");

    const log = await git(app.stateDir, "log", "--format=%s");
    expect(log).toContain("aprende: user/estilo-de-revisao");
    expect(log).toContain("aprende: contract/contrato-de-checkout");
  });

  it("erro de domínio sai como mensagem e código 1, não como stack", async () => {
    const app = cli();

    expect(await app.run("write", "--name", "Sem tipo")).toBe(1);
    expect(app.err).toContain("--type é obrigatório");
    expect(app.err).not.toContain("at ");
  });

  it("recusa tipo fora da taxonomia, dizendo quais existem", async () => {
    const app = cli();

    expect(await app.run("write", "--name", "X", "--type", "anotacao")).toBe(1);
    expect(app.err).toContain("tipo inválido");
    expect(app.err).toContain("contract");
  });

  it("reindex com arquivo quebrado sai 2 e diz qual é", async () => {
    const app = cli();
    await app.run("write", "--name", "Boa", "--type", "user");
    writeFileSync(join(app.stateDir, "memory", "user_quebrada.md"), "sem frontmatter\n");

    // Código 2 e não 1: houve resultado — as outras foram indexadas —, e o
    // operador precisa distinguir "falhou tudo" de "uma está quebrada".
    expect(await app.run("reindex")).toBe(2);
    expect(app.out).toContain("indexadas: 1");
    expect(app.err).toContain("user_quebrada.md");
  });

  /**
   * A fronteira de escrita, que é o que a A9 pede e o que faltava: as flags
   * entravam por `as` e ninguém validava nada. Cada caso abaixo **gravava e
   * commitava** um arquivo que o próprio `read` recusa depois — memória que o
   * sistema escreve e não consegue ler de volta.
   */
  it("recusa ator fora da lista, sem gravar nem commitar", async () => {
    const app = cli();

    expect(await app.run("write", "--name", "X", "--type", "user", "--actor", "hacker")).toBe(1);
    expect(app.err).toContain("ator inválido");
    expect(existsSync(join(app.stateDir, "memory", "user_x.md"))).toBe(false);
  });

  it("recusa escopo fora da lista com erro de domínio, e não com TypeError", async () => {
    const app = cli();

    expect(await app.run("write", "--name", "X", "--type", "user", "--scope", "worktree")).toBe(1);
    // O sufixo, e não só o prefixo: `memoryDirFor` lança `DomainError` com a
    // mesma abertura de mensagem, então "escopo inválido" sozinho passa mesmo
    // sem o `asScope` — a lista de opções é o que só a CLI produz.
    expect(app.err).toContain("escopo inválido: worktree. Um de: global, workspace, project");
    expect(app.err).not.toContain("path");
  });

  it("recusa descrição vazia", async () => {
    const app = cli();

    expect(await app.run("write", "--name", "X", "--type", "user", "--description", "")).toBe(1);
    expect(app.err).toContain("description");
    expect(existsSync(join(app.stateDir, "memory", "user_x.md"))).toBe(false);
  });

  it("valor começado por traço é valor, e não flag nova", async () => {
    const app = cli();

    expect(
      await app.run("write", "--name", "Regra", "--type", "user", "--body", "--- regra importante"),
    ).toBe(0);
    expect(await app.run("read", "--name", "Regra", "--type", "user")).toBe(0);
    // Antes, o corpo virava o literal `"true"` e o comando saía 0 sem avisar.
    expect(app.out).toContain("--- regra importante");
  });

  it("aceita a forma --flag=valor", async () => {
    const app = cli();

    expect(await app.run("write", "--name=Regra", "--type=user", "--body=corpo com = sinal")).toBe(0);
    expect(await app.run("read", "--name=Regra", "--type=user")).toBe(0);
    expect(app.out).toContain("corpo com = sinal");
  });

  it("comando desconhecido mostra o uso", async () => {
    const app = cli();

    expect(await app.run("aprender-tudo")).toBe(1);
    expect(app.err).toContain("comando desconhecido");
    expect(app.err).toContain("uso: lumem-memory");
  });
});
