import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
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

  it("recusa segredo pela linha de comando, e a decisão fica registrada", async () => {
    const app = cli();

    expect(
      await app.run("write", "--name", "Chave", "--type", "user", "--body", "AKIAIOSFODNN7EXAMPLE"),
    ).toBe(1);
    expect(app.err).toContain("credencial");

    expect(await app.run("decisions")).toBe(0);
    expect(app.out).toContain("rejected");
    expect(app.out).toContain("aws_access_key");
    // O motivo não pode repetir o que foi escaneado.
    expect(app.out).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("revert desfaz a última mudança pela linha de comando", async () => {
    const app = cli();
    await app.run("write", "--name", "Regra", "--type", "user", "--body", "primeira");
    await app.run("write", "--name", "Regra", "--type", "user", "--body", "segunda");

    expect(await app.run("revert", "--path", "memory/user_regra.md")).toBe(0);
    expect(app.out).toContain("revertida: memory/user_regra.md");

    expect(await app.run("read", "--name", "Regra", "--type", "user")).toBe(0);
    expect(app.out).toContain("primeira");
  });

  it("`decisions --path` mostra só o caminho pedido", async () => {
    const app = cli();
    await app.run("write", "--name", "Regra", "--type", "user", "--body", "primeira");
    await app.run("write", "--name", "Outra", "--type", "user", "--body", "segunda");

    // `out` acumula entre comandos, então o que importa é só o que saiu daqui.
    const antes = app.out.length;
    expect(await app.run("decisions", "--path", "memory/user_regra.md")).toBe(0);
    const listagem = app.out.slice(antes);

    expect(listagem).toContain("memory/user_regra.md");
    // Sem o filtro chegando ao SQL, `--path` seria decoração: sairia o topo do
    // histórico inteiro, recortado pelo limite.
    expect(listagem).not.toContain("memory/user_outra.md");
  });

  it("`forget` deixa o rastro de quem pediu, não só o commit", async () => {
    const app = cli();
    await app.run("write", "--name", "Regra", "--type", "user", "--body", "primeira");

    expect(await app.run("forget", "--name", "Regra", "--type", "user")).toBe(0);

    const antes = app.out.length;
    expect(await app.run("decisions", "--path", "memory/user_regra.md")).toBe(0);

    expect(app.out.slice(antes)).toContain("delete");
  });

  it("comando desconhecido mostra o uso", async () => {
    const app = cli();

    expect(await app.run("aprender-tudo")).toBe(1);
    expect(app.err).toContain("comando desconhecido");
    expect(app.err).toContain("uso: lumem-memory");
  });
});
