import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { execGit, type GitExec } from "../git/exec.js";
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

  it("deixa o catálogo com o conteúdo restaurado, não com o que foi desfeito", async () => {
    const { memory, stateDir } = await service();
    const first = await memory.write({ ...base, body: "primeira versão" });
    await memory.write({ ...base, body: "segunda versão" });

    await memory.revert(first.path);

    const [row] = memory.list();
    const noDisco = readFileSync(join(stateDir, first.path), "utf8");
    // O catálogo é projeção do disco: se `revert` não o reindexasse, ele ficaria
    // apontando para a versão que acabou de ser desfeita.
    expect(row?.contentHash).toBe(MemoryService.hash(noDisco));
  });

  it("o conteúdo anterior também passa pelo portão — e reprovado não vai ao disco", async () => {
    const { memory, stateDir } = await service();
    const first = await memory.write({ ...base, body: "primeira versão" });
    const absolute = join(stateDir, first.path);

    // Uma versão com segredo entra no histórico **por fora** do portão: edição à
    // mão no `~/.lumem`, ou memória escrita antes de o portão existir. É o único
    // jeito de o commit anterior conter algo que o scan recusaria.
    writeFileSync(
      absolute,
      readFileSync(absolute, "utf8").replace(
        "primeira versão",
        "a chave é ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345",
      ),
    );
    await git(stateDir, "add", first.path);
    await git(stateDir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "à mão");

    await memory.write({ ...base, body: "terceira versão" });
    const antes = await git(stateDir, "rev-parse", "HEAD");

    await expect(memory.revert(first.path)).rejects.toBeInstanceOf(MemoryRejected);

    // Decidir depois de gravar registraria `rejected` no WAL e mandaria o
    // segredo para o `HEAD` assim mesmo.
    expect(readFileSync(absolute, "utf8")).toContain("terceira versão");
    expect(await git(stateDir, "rev-parse", "HEAD")).toBe(antes);
    const [decision] = memory.decisions({ path: first.path });
    expect(decision?.outcome).toBe("rejected");
    expect(decision?.commitSha).toBeNull();
  });
});

describe("a chave de idempotência do revert", () => {
  /**
   * Um serviço cujo `commitChange` pode devolver `commit: null` sem lançar.
   *
   * A falha é injetada no **staging**, não no `commit`: um `git commit` que
   * falha depois do `git add` deixa a mudança no índice, e o commit seguinte —
   * de qualquer outra memória — a varre junto, movendo o histórico do arquivo.
   * Isso esconderia exatamente o que estes dois testes medem.
   */
  async function serviceWithFlakyCommit() {
    const stateDir = join(tempDir("lumem-gate-"), ".lumem");
    await ensureMemoryHome({ stateDir });
    const db = openTestDb();
    databases.push(db);

    let breakCommit = false;
    const exec: GitExec = async (args, options) => {
      if (breakCommit && args[0] === "add") throw new Error("staging impedido");
      return execGit(args, options);
    };

    return {
      memory: new MemoryService({ db: db.db, stateDir, exec }),
      stateDir,
      break: (value: boolean) => {
        breakCommit = value;
      },
    };
  }

  it("repetir o mesmo revert do mesmo estado é a mesma decisão", async () => {
    const app = await serviceWithFlakyCommit();
    const first = await app.memory.write({ ...base, body: "primeira versão" });
    await app.memory.write({ ...base, body: "segunda versão" });

    app.break(true);
    await app.memory.revert(first.path);
    app.break(false);
    await app.memory.revert(first.path);

    // O commit falhou, nada se moveu, e o segundo revert é a **retentativa** do
    // primeiro. Duas linhas aqui seriam duas decisões para um ato só.
    const reverts = app.memory.decisions().filter((row) => row.idempotencyKey.startsWith("revert:"));
    expect(reverts).toHaveLength(1);
    expect(reverts[0]?.commitSha).not.toBeNull();
  });

  it("o mesmo ponto revertido de um `HEAD` diferente é outra decisão", async () => {
    const app = await serviceWithFlakyCommit();
    const first = await app.memory.write({ ...base, body: "primeira versão" });
    await app.memory.write({ ...base, body: "segunda versão" });

    app.break(true);
    await app.memory.revert(first.path);
    app.break(false);
    // Outra memória move o `HEAD` sem tocar no histórico **deste** arquivo: o
    // `previousSha` do próximo revert continua o mesmo.
    await app.memory.write({ ...base, name: "Outra regra", body: "conteúdo qualquer" });
    await app.memory.revert(first.path);

    // Sem o `HEAD` na chave, o segundo revert mutaria o disco e não viraria
    // decisão — e o `attachCommit` ainda sobrescreveria o SHA do primeiro.
    const reverts = app.memory.decisions().filter((row) => row.idempotencyKey.startsWith("revert:"));
    expect(reverts).toHaveLength(2);
  });
});

describe("apagar", () => {
  it("`forget` vira decisão no WAL — o git sabe que sumiu, não quem pediu", async () => {
    const { memory } = await service();
    await memory.write({ ...base, body: "Achado primeiro." });

    const { path, commit } = await memory.forget("user", base.name);

    // A Q29 promete que apagar é reversível pelo WAL, e a Q37 lista `delete`
    // entre os resultados. Sem esta linha, deleção só existiria no git.
    const [decision] = memory.decisions({ path });
    expect(decision?.operation).toBe("delete");
    expect(decision?.outcome).toBe("applied");
    expect(decision?.commitSha).toBe(commit);
  });

  it("apagar de novo o que voltou a existir é outra decisão", async () => {
    const { memory } = await service();
    await memory.write({ ...base, body: "Achado primeiro." });
    const { path } = await memory.forget("user", base.name);
    await memory.write({ ...base, body: "Achado de novo." });

    await memory.forget("user", base.name);

    // Sem o `HEAD` na chave, o segundo apagamento cairia na linha do primeiro e
    // sumiria do WAL — que é justamente onde ele deveria estar.
    const deletes = memory.decisions({ path }).filter((row) => row.operation === "delete");
    expect(deletes).toHaveLength(2);
  });

  it("desfazer a criação também vira decisão de `delete`", async () => {
    const { memory } = await service();
    const created = await memory.write({ ...base, body: "única versão" });

    const result = await memory.revert(created.path);

    const [decision] = memory.decisions({ path: created.path });
    expect(decision?.operation).toBe("delete");
    expect(decision?.commitSha).toBe(result.commit);
  });
});
