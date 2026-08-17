import { execFile } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { DomainError } from "../errors.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
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

async function service(): Promise<{ memory: MemoryService; stateDir: string; db: TestDb }> {
  const stateDir = join(tempDir("lumem-service-"), ".lumem");
  await ensureMemoryHome({ stateDir });
  const db = openTestDb();
  databases.push(db);
  return { memory: new MemoryService({ db: db.db, stateDir }), stateDir, db };
}

const preferencia = {
  name: "Estilo de revisão",
  description: "Achado com arquivo e linha antes do texto",
  type: "user" as const,
  body: "Achado primeiro, explicação depois.",
  actor: "human" as const,
};

describe("MemoryService.write", () => {
  it("escreve Markdown legível, no escopo derivado do tipo", async () => {
    const { memory, stateDir } = await service();

    const result = await memory.write(preferencia);

    expect(result.scope).toBe("global");
    expect(result.path).toBe("memory/user_estilo-de-revisao.md");
    const text = readFileSync(join(stateDir, result.path), "utf8");
    expect(text).toContain("type: user");
    expect(text).toContain("Achado primeiro");
  });

  it("o commit conta a história", async () => {
    const { memory, stateDir } = await service();

    const result = await memory.write(preferencia);

    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await git(stateDir, "log", "-1", "--format=%s")).toBe(
      "aprende: user/estilo-de-revisao",
    );
  });

  it("substituir preserva a data de nascimento e move a de atualização", async () => {
    const { memory, stateDir } = await service();
    await memory.write(preferencia);
    const primeiro = readFileSync(join(stateDir, "memory/user_estilo-de-revisao.md"), "utf8");
    const nascimento = /created_at: (\S+)/.exec(primeiro)?.[1];

    await new Promise((resolve) => setTimeout(resolve, 5));
    const segundo = await memory.write({ ...preferencia, body: "Mudou de ideia." });

    expect(segundo.created).toBe(false);
    const texto = readFileSync(join(stateDir, segundo.path), "utf8");
    expect(texto).toContain(`created_at: ${nascimento}`);
    expect(/updated_at: (\S+)/.exec(texto)?.[1]).not.toBe(nascimento);
    expect(await git(stateDir, "log", "-1", "--format=%s")).toBe(
      "atualiza: user/estilo-de-revisao",
    );
  });

  it("escreve nos três escopos, cada um no seu lugar", async () => {
    const { memory } = await service();

    const global = await memory.write(preferencia);
    const workspace = await memory.write({
      name: "Plano sem preço",
      description: "Usuário sem plano ativo vê catálogo, não preço",
      type: "domain",
      body: "Regra de produto.",
      actor: "human",
      workspaceId: "ws1",
    });
    const projeto = await memory.write({
      name: "Gate rápido",
      description: "pnpm gate:quick roda o afetado",
      type: "project",
      body: "Comando do repositório.",
      actor: "human",
      workspaceId: "ws1",
      projectId: "p1",
    });

    expect(global.path).toBe("memory/user_estilo-de-revisao.md");
    expect(workspace.path).toBe("workspaces/ws1/memory/domain_plano-sem-preco.md");
    expect(projeto.path).toBe("workspaces/ws1/projects/p1/memory/project_gate-rapido.md");
  });

  it("o arquivo nasce 0600 — memória é do usuário", async () => {
    const { memory, stateDir } = await service();

    const result = await memory.write(preferencia);

    // eslint-disable-next-line no-bitwise -- bits de permissão são bits.
    expect(statSync(join(stateDir, result.path)).mode & 0o777).toBe(0o600);
  });

  it("guarda a worktree como origem, e nunca como escopo", async () => {
    const { memory, stateDir } = await service();

    const result = await memory.write({
      ...preferencia,
      type: "project",
      workspaceId: "ws1",
      projectId: "p1",
      worktreeId: "wt-abc",
    });

    // Q5: worktree é de onde veio, não onde mora.
    expect(result.path).not.toContain("wt-abc");
    expect(readFileSync(join(stateDir, result.path), "utf8")).toContain("worktree_id: wt-abc");
  });
});

describe("MemoryService.read e list", () => {
  it("lê de volta o que escreveu", async () => {
    const { memory } = await service();
    await memory.write(preferencia);

    const entry = await memory.read("user", "Estilo de revisão");

    expect(entry.body).toBe("Achado primeiro, explicação depois.");
    expect(entry.provenance.source_actor).toBe("human");
  });

  it("dizer que não existe é resposta, não exceção crua", async () => {
    const { memory } = await service();

    await expect(memory.read("user", "Nunca escrita")).rejects.toBeInstanceOf(DomainError);
  });

  it("lista o que existe, com escopo e proveniência", async () => {
    const { memory } = await service();
    await memory.write(preferencia);
    await memory.write({
      name: "Convenção de commit",
      description: "Conventional Commits sempre",
      type: "process",
      body: "Regra do time.",
      actor: "human",
      workspaceId: "ws1",
    });

    const rows = memory.list();

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.scope).sort()).toEqual(["global", "workspace"]);
    expect(rows.every((row) => row.sourceActor === "human")).toBe(true);
  });
});

describe("MemoryService.forget", () => {
  it("apaga o arquivo e mantém o histórico", async () => {
    const { memory, stateDir } = await service();
    await memory.write(preferencia);

    const result = await memory.forget("user", "Estilo de revisão");

    expect(memory.list()).toHaveLength(0);
    expect(await git(stateDir, "log", "-1", "--format=%s")).toBe("esquece: user/estilo-de-revisao");
    // Q29: apagar é ação sua, e reversível — o git ainda sabe o que existiu.
    expect(await git(stateDir, "log", "--format=%s", "--", result.path)).toContain("aprende:");
  });
});

describe("MemoryService.reindex", () => {
  it("apagar o catálogo e reindexar devolve exatamente o mesmo conteúdo", async () => {
    const { memory, db } = await service();
    await memory.write(preferencia);
    await memory.write({
      name: "Contrato de checkout",
      description: "api expõe POST /v2/checkout; web consome",
      type: "contract",
      body: "Contrato entre projetos.",
      actor: "human",
      workspaceId: "ws1",
    });
    // Só o id da linha é descartado: ele é identificador da projeção, não da
    // memória. Tudo o mais — inclusive as datas — tem que voltar igual.
    const antes = memory.list().map(({ id: _id, ...rest }) => rest);

    db.db.run("DELETE FROM memory_entry");
    expect(memory.list()).toHaveLength(0);
    const result = await memory.reindex();

    expect(result.indexed).toBe(2);
    expect(memory.list().map(({ id: _id, ...rest }) => rest)).toEqual(antes);
  });

  it("vê o arquivo editado à mão", async () => {
    const { memory, stateDir } = await service();
    const { path } = await memory.write(preferencia);
    const texto = readFileSync(join(stateDir, path), "utf8").replace(
      "description: Achado com arquivo e linha antes do texto",
      "description: Editado no editor do usuário",
    );
    writeFileSync(join(stateDir, path), texto);

    await memory.reindex();

    // Markdown é a fonte da verdade: o banco segue o disco, e não o contrário.
    expect(memory.list()[0]?.description).toBe("Editado no editor do usuário");
  });

  it("relata o arquivo corrompido em vez de ignorá-lo", async () => {
    const { memory, stateDir } = await service();
    await memory.write(preferencia);
    writeFileSync(join(stateDir, "memory", "user_quebrada.md"), "sem frontmatter nenhum\n");

    const result = await memory.reindex();

    expect(result.indexed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.path).toBe("memory/user_quebrada.md");
    expect(result.failures[0]?.reason).toContain("frontmatter");
  });

  it("não indexa o que é interno", async () => {
    const { memory, stateDir } = await service();
    await memory.write(preferencia);
    writeFileSync(join(stateDir, "_system", "rascunho.md"), "artefato interno\n");
    writeFileSync(join(stateDir, "context", "sessao.md"), "bloco montado\n");

    const result = await memory.reindex();

    // §5 do PRD: `_system/` e `context/` nunca entram no índice.
    expect(result.indexed).toBe(1);
    expect(result.failures).toHaveLength(0);
  });
});
