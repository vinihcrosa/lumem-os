import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import Database from "better-sqlite3";
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
    /** Simula o banco anterior à busca: catálogo de pé, índice nunca criado. */
    dropIndex() {
      const sqlite = new Database(join(stateDir, "lumem.db"));
      sqlite.exec("DROP TABLE IF EXISTS memory_fts");
      sqlite.close();
    },
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

    // `list` é o que o escopo enxerga — igual ao router. Sem `--workspace`, o
    // escopo ativo é só o global, e a memória de `ws1` não pertence a ele.
    expect(await app.run("list")).toBe(0);
    expect(app.out).toContain("global    user      Estilo de revisão");
    expect(app.out).not.toContain("Contrato de checkout");

    expect(await app.run("list", "--workspace", "ws1")).toBe(0);
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

  it("`list` responde igual ao router, e `--all` é que mostra a lista crua", async () => {
    const app = cli();
    await app.run("write", "--name", "Regra", "--type", "user", "--body", "global");
    await app.run(
      "write", "--name", "Regra", "--type", "user",
      "--scope", "project", "--workspace", "ws1", "--project", "p1", "--body", "do projeto",
    );

    expect(await app.run("list", "--workspace", "ws1", "--project", "p1")).toBe(0);
    // Uma linha por identidade visível, e o sombreamento dito em voz alta: o
    // `Done when` da PR 03 é o mesmo comando respondendo igual nas duas
    // superfícies, e o router já respondia o resolvido.
    expect(app.out.match(/user      Regra/g)).toHaveLength(1);
    expect(app.out).toContain("sombreada user/regra por workspaces/ws1/projects/p1/memory/user_regra.md");

    const cru = cli();
    await cru.run("write", "--name", "Regra", "--type", "user", "--body", "global");
    await cru.run(
      "write", "--name", "Regra", "--type", "user",
      "--scope", "project", "--workspace", "ws1", "--project", "p1", "--body", "do projeto",
    );
    expect(await cru.run("list", "--all")).toBe(0);
    expect(cru.out.match(/user      Regra/g)).toHaveLength(2);
  });

  it("recusa escopo e ator inválidos — o que a API recusa, a CLI recusa", async () => {
    const app = cli();

    expect(await app.run("write", "--name", "X", "--type", "user", "--scope", "planeta")).toBe(1);
    expect(app.err).toContain("escopo inválido");

    expect(await app.run("write", "--name", "X", "--type", "user", "--actor", "estagiario")).toBe(1);
    expect(app.err).toContain("ator inválido");
  });

  it("agente não escreve contract de workspace pela CLI tampouco (Q27)", async () => {
    const app = cli();

    expect(
      await app.run(
        "write", "--name", "Contrato", "--type", "contract",
        "--workspace", "ws1", "--actor", "agent", "--body", "itens e cupom",
      ),
    ).toBe(1);
    expect(app.err).toContain("Q27");
  });

  it("revert recusa caminho que não é de memória", async () => {
    const app = cli();
    await app.run("write", "--name", "Regra", "--type", "user", "--body", "primeira");

    expect(await app.run("revert", "--path", ".gitignore")).toBe(1);
    expect(app.err).toContain("não é caminho de memória");
  });

  it("busca e explica por que cada resultado apareceu", async () => {
    const app = cli();
    await app.run(
      "write", "--name", "Contrato de checkout", "--type", "contract", "--workspace", "ws1",
      "--description", "api expõe POST /v2/checkout e o web consome",
      "--body", "O corpo carrega itens e cupom.",
    );

    expect(await app.run("search", "--query", "checkout consome", "--workspace", "ws1")).toBe(0);
    expect(app.out).toContain("Contrato de checkout");
    expect(app.out).toContain("lexical=");
  });

  it("busca num banco sem índice reconstrói antes, e acha pelo corpo", async () => {
    const app = cli();
    await app.run(
      "write", "--name", "Rollback do checkout", "--type", "process", "--workspace", "ws1",
      "--description", "como desfazer um deploy ruim",
      "--body", "reverte o deploy e avisa o time",
    );
    app.dropIndex();

    expect(await app.run("search", "--query", "avisa time", "--workspace", "ws1")).toBe(0);

    // Pelo corpo: só volta se o reparo releu o disco. A CLI existe para
    // inspecionar sem subir o daemon, então ela não pode esperar o boot.
    expect(app.out).toContain("Rollback do checkout");
    expect(app.err).toContain("índice reconstruído: 1");
  });

  it("memória ilegível sai do índice com nome, não em silêncio", async () => {
    const app = cli();
    await app.run("write", "--name", "Gate", "--type", "user", "--body", "pnpm gate quick");
    writeFileSync(join(app.stateDir, "memory/user_gate.md"), "isto não é uma memória");
    app.dropIndex();

    expect(await app.run("search", "--query", "gate rapido")).toBe(0);

    expect(app.err).toContain("fora do índice: memory/user_gate.md");
  });

  it("comando de leitura não reconstrói nada", async () => {
    const app = cli();
    await app.run("write", "--name", "Gate", "--type", "user", "--body", "x");
    app.dropIndex();

    expect(await app.run("list")).toBe(0);

    // `list` lê o catálogo, não o índice. Reconstruir aqui seria escrita
    // escondida num comando de leitura — e `reindex` apaga o catálogo inteiro.
    expect(app.err).toBe("");
  });

  it("limite que não é número é erro de uso, não stack", async () => {
    const app = cli();
    await app.run("write", "--name", "Gate", "--type", "user", "--body", "x");

    expect(await app.run("search", "--query", "gate rapido", "--limit", "abc")).toBe(1);
    expect(app.err).toContain("--limit precisa ser um número");
  });

  it("busca trivial diz que **não buscou**, e não que não achou", async () => {
    const app = cli();
    await app.run("write", "--name", "Gate", "--type", "user", "--body", "x");

    expect(await app.run("search", "--query", "gate")).toBe(1);
    expect(app.err).toContain("não realizada");
  });

  it("usage mostra os números por tipo", async () => {
    const app = cli();
    await app.run("write", "--name", "Gate rápido", "--type", "user", "--body", "pnpm gate quick");
    // Sem `--session` a busca é inspeção e não registra; com ela, é o caminho
    // do agente, e o §6 ganha a linha.
    await app.run("search", "--query", "gate rapido");
    expect(await app.run("usage")).toBe(0);
    expect(app.out).toContain("nenhum uso registrado");

    await app.run("search", "--query", "gate rapido", "--session", "s1");

    expect(await app.run("usage")).toBe(0);
    expect(app.out).toContain("recall");
    expect(app.out).toContain("sessões=1");
  });

  it("comando desconhecido mostra o uso", async () => {
    const app = cli();

    expect(await app.run("aprender-tudo")).toBe(1);
    expect(app.err).toContain("comando desconhecido");
    expect(app.err).toContain("uso: lumem-memory");
  });
});
