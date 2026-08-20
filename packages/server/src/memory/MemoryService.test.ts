import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { openTestDb, type TestDb } from "../db/testing.js";
import { DomainError } from "../errors.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

import { MemoryService } from "./MemoryService.js";
import { serializeEntry } from "./entry.js";
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
  it("reescreve por cima de um arquivo corrompido, avisando", async () => {
    const { memory, stateDir, db } = await service();
    await memory.write(preferencia);
    // Alguém — ou um crash — deixou o arquivo ilegível. A ferramenta que
    // escreveu a memória tem que conseguir consertá-la; antes ela recusava, e a
    // única saída era apagar o arquivo por fora.
    writeFileSync(join(stateDir, "memory/user_estilo-de-revisao.md"), "frontmatter? que frontmatter?\n");

    const warns: string[] = [];
    const rescue = new MemoryService({
      db: db.db,
      stateDir,
      log: { warn: (_details: unknown, message?: string) => warns.push(message ?? "") },
    });
    const result = await rescue.write({ ...preferencia, body: "consertado" });

    expect(result.created).toBe(false);
    expect(readFileSync(join(stateDir, result.path), "utf8")).toContain("consertado");
    expect(warns).toEqual(["memória anterior ilegível; a data de nascimento recomeça agora"]);
    const entry = await rescue.read("user", preferencia.name);
    expect(entry.body).toBe("consertado");
  });

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

describe("MemoryService.write — identidade já reivindicada", () => {
  /** Uma memória válida no disco, num caminho que o `write` nunca escolheria. */
  function put(stateDir: string, relativePath: string, name: string): void {
    writeFileSync(
      join(stateDir, relativePath),
      serializeEntry({
        name,
        description: "escrita à mão, fora da convenção de nome",
        type: "user",
        scope: "global",
        pinned: false,
        provenance: {
          source_actor: "human",
          source_sessions: [],
          confidence: "medium",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        body: "Veio de antes.",
      }),
      "utf8",
    );
  }

  /**
   * O espelho, pela via do `write`, do que o `reindex` já recusava.
   *
   * `slugFromPath` tira o prefixo `<tipo>_`, então `memory/alfa.md` e
   * `memory/user_alfa.md` reivindicam o mesmo `(global, '', '', user, alfa)`.
   * Antes quem descobria isso era o índice único do SQLite — **depois** do
   * `writeAtomically` e antes do `commitChange`: arquivo novo no disco, sem
   * commit, catálogo ainda apontando para o antigo, e um `SqliteError` cru
   * subindo até o usuário. Recusar antes de tocar em qualquer coisa é o que
   * mantém os dois caminhos de acordo sobre quem é dono de uma identidade.
   */
  it("recusa antes de escrever, dizendo qual arquivo já é dono", async () => {
    const { memory, stateDir } = await service();
    put(stateDir, "memory/alfa.md", "Alfa");
    await memory.reindex();
    const head = await git(stateDir, "rev-parse", "HEAD");
    const antes = memory.list();

    const escrita = memory.write({ ...preferencia, name: "Alfa" });

    await expect(escrita).rejects.toBeInstanceOf(DomainError);
    // Quem lê precisa saber qual arquivo apagar ou renomear.
    await expect(escrita).rejects.toThrow(/memory\/alfa\.md/);
    expect(existsSync(join(stateDir, "memory", "user_alfa.md"))).toBe(false);
    expect(await git(stateDir, "rev-parse", "HEAD")).toBe(head);
    expect(memory.list()).toEqual(antes);
  });

  it("reescrever a mesma memória continua funcionando, com a data de nascimento", async () => {
    const { memory, stateDir } = await service();
    const primeira = await memory.write(preferencia);
    const nascimento = /created_at: (\S+)/.exec(readFileSync(join(stateDir, primeira.path), "utf8"))?.[1];

    const segunda = await memory.write({ ...preferencia, body: "Mudou de ideia." });

    expect(segunda.created).toBe(false);
    expect(segunda.path).toBe(primeira.path);
    expect(readFileSync(join(stateDir, segunda.path), "utf8")).toContain(`created_at: ${nascimento}`);
  });

  it("a mesma (tipo, slug) em escopos diferentes é legítima", async () => {
    const { memory } = await service();
    const receita = {
      name: "Gate rápido",
      description: "pnpm gate:quick roda o afetado",
      type: "project" as const,
      body: "Comando do repositório.",
      actor: "human" as const,
    };

    const p1 = await memory.write({ ...receita, workspaceId: "ws1", projectId: "p1" });
    const p2 = await memory.write({ ...receita, workspaceId: "ws1", projectId: "p2" });
    const ws = await memory.write({ ...receita, scope: "workspace", workspaceId: "ws1" });

    // A identidade é `(escopo, workspace, projeto, tipo, slug)`: o mesmo par
    // `(tipo, slug)` em escopos diferentes é memória diferente, não duplicata.
    expect([p1.path, p2.path, ws.path]).toEqual([
      "workspaces/ws1/projects/p1/memory/project_gate-rapido.md",
      "workspaces/ws1/projects/p2/memory/project_gate-rapido.md",
      "workspaces/ws1/memory/project_gate-rapido.md",
    ]);
    expect(memory.list()).toHaveLength(3);
  });
});

describe("MemoryService.write — os limites moram no núcleo", () => {
  it("recusa descrição vazia e corpo gigante, e não é o router que decide isso", async () => {
    const { memory } = await service();

    // Os limites estavam só no zod do router: a CLI aceitava pelo núcleo o que a
    // API recusava na porta, que é a segunda semântica só na entrada.
    await expect(memory.write({ ...preferencia, description: "" })).rejects.toThrow(DomainError);
    await expect(memory.write({ ...preferencia, body: "x".repeat(100_001) })).rejects.toThrow(
      DomainError,
    );
    await expect(
      // @ts-expect-error é justamente o valor que o cast da CLI deixava passar
      memory.write({ ...preferencia, scope: "planeta" }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("agente escrevendo contract de workspace vira proposta, e não toca o disco (Q27)", async () => {
    const { memory, stateDir } = await service();

    const result = await memory.write({
      name: "Contrato de checkout",
      description: "O que o front espera do back",
      type: "contract",
      workspaceId: "ws1",
      actor: "agent",
      body: "Itens e cupom.",
    });

    // A 03 recusava com motivo porque a inbox não existia; a 05 desvia. O que não
    // mudou é o que importa: nada gravado sem a sua revisão.
    expect(result.outcome).toBe("proposed");
    expect(memory.proposals({ status: "pending" })).toHaveLength(1);
    expect(() =>
      statSync(join(stateDir, "workspaces/ws1/memory/contract_contrato-de-checkout.md")),
    ).toThrow();
    // E proposta não é decisão: o WAL registra o que passou pelo portão.
    expect(memory.decisions()).toHaveLength(0);
  });

  it("segredo não vira proposta: o scan recusa antes da inbox, e o WAL registra", async () => {
    const { memory } = await service();

    await expect(
      memory.write({
        name: "Contrato de checkout",
        description: "Com chave dentro",
        type: "contract",
        workspaceId: "ws1",
        actor: "agent",
        body: "AKIAIOSFODNN7EXAMPLE",
      }),
    ).rejects.toMatchObject({ code: "BLOCKED" });

    // Quando o conteúdo tem segredo, é o segredo que a resposta nomeia — e o
    // desvio para a inbox não acontece: guardar a chave no banco e mostrá-la na
    // tela é exatamente o que o scan existe para impedir.
    const decision = memory.decisions()[0];
    expect(decision?.reason).toContain("credencial");
    expect(decision?.ruleTrace).toContain("aws_access_key");
    expect(memory.proposals()).toHaveLength(0);
  });
});

describe("MemoryService.revert — só caminho de memória", () => {
  it("recusa arquivo do repositório do daemon, sem apagá-lo", async () => {
    const { memory, stateDir } = await service();
    await memory.write(preferencia);

    await expect(memory.revert(".gitignore")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(memory.revert("memory/../.gitignore")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(memory.revert("memory/notas.txt")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });

    // O git barra `../`; ele não barra `.gitignore`, e `revert` faz `rm` + commit.
    expect(statSync(join(stateDir, ".gitignore")).isFile()).toBe(true);
  });

  it("recusa glob no lugar do id — pathspec não é nome", async () => {
    const { memory, stateDir } = await service();
    await memory.write({ ...preferencia, scope: "workspace", workspaceId: "ws1" });
    await memory.write({ ...preferencia, scope: "workspace", workspaceId: "ws2" });

    // `workspaces/*/memory/user_*.md` casava as duas pelo pathspec, e o ramo de
    // deleção commitava a memória do outro workspace com `git add --all`.
    await expect(
      memory.revert("workspaces/*/memory/user_estilo-de-revisao.md"),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(memory.revert("workspaces/[a-z]*/memory/user_x.md")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });

    expect(
      statSync(join(stateDir, "workspaces/ws2/memory/user_estilo-de-revisao.md")).isFile(),
    ).toBe(true);
  });

  it("desfazer o primeiro commit apaga — e grava decisão como o outro ramo", async () => {
    const { memory } = await service();
    const written = await memory.write(preferencia);

    const result = await memory.revert(written.path);

    expect(result.outcome).toBe("deleted");
    // O `Done when` da PR 02 é "volta o conteúdo e grava uma decisão nova", e
    // desfazer que apaga é o desfazer que mais muda o acervo.
    const decisions = memory.decisions({ path: written.path });
    expect(decisions[0]).toMatchObject({ operation: "delete", outcome: "applied" });
    expect(decisions[0]?.commitSha).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("MemoryService.pin — o núcleo é escolha sua", () => {
  it("grava no arquivo, porque o Markdown é a fonte", async () => {
    const { memory, stateDir } = await service();
    const { path } = await memory.write(preferencia);

    const result = await memory.pin(path, true);

    expect(result).toMatchObject({ pinned: true, changed: true });
    expect(result.commit).not.toBeNull();
    // No arquivo, e não só na coluna: um `pinned` que morasse no banco
    // desapareceria no primeiro `reindex`.
    expect(readFileSync(join(stateDir, path), "utf8")).toContain("pinned: true");
  });

  it("uma memória editada à mão entra no núcleo sem passar por API nenhuma", async () => {
    const { memory, stateDir } = await service();
    const { path } = await memory.write(preferencia);
    const file = join(stateDir, path);
    writeFileSync(file, readFileSync(file, "utf8").replace("pinned: false", "pinned: true"));

    await memory.reindex();

    // Pelo catálogo, que é a projeção que o núcleo consulta.
    expect(memory.list().find((row) => row.path === path)?.pinned).toBe(true);
  });

  it("reescrever o texto não desfixa: fixar é curadoria, não conteúdo", async () => {
    const { memory, stateDir } = await service();
    const { path } = await memory.write(preferencia);
    await memory.pin(path, true);

    await memory.write({ ...preferencia, body: "Outro corpo, mesma memória." });

    expect(readFileSync(join(stateDir, path), "utf8")).toContain("pinned: true");
  });

  it("fixar duas vezes não produz commit vazio", async () => {
    const { memory } = await service();
    const { path } = await memory.write(preferencia);
    await memory.pin(path, true);

    const again = await memory.pin(path, true);

    expect(again).toMatchObject({ changed: false, commit: null });
  });

  it("ator não-humano não fixa", async () => {
    const { memory } = await service();
    const { path } = await memory.write(preferencia);

    await expect(memory.pin(path, true, "agent")).rejects.toThrow(DomainError);
  });
});

describe("MemoryService.write — o terceiro estado do `proposal`", () => {
  it("`true` manda para a inbox mesmo onde a Q27 deixaria passar direto", async () => {
    const { memory } = await service();

    // `project` em escopo de projeto, escrito por agente: a Q27 deixa passar. O
    // auto-learn sem evidência é o único caminho que **aperta** a regra.
    const result = await memory.write({
      name: "Endpoint de checkout",
      description: "o caminho que o web consome",
      type: "project",
      scope: "project",
      workspaceId: "ws1",
      projectId: "p1",
      body: "POST /v2/checkout",
      actor: "auto_research",
      proposal: true,
    });

    expect(result.outcome).toBe("proposed");
    expect(memory.list()).toHaveLength(0);
    expect(memory.proposals({ status: "pending" })).toHaveLength(1);
  });

  it("ausente continua sendo a Q27 decidindo", async () => {
    const { memory } = await service();

    const result = await memory.write({
      name: "Endpoint de checkout",
      description: "o caminho que o web consome",
      type: "project",
      scope: "project",
      workspaceId: "ws1",
      projectId: "p1",
      body: "POST /v2/checkout",
      actor: "agent",
    });

    expect(result.outcome).toBe("applied");
  });
});

describe("MemoryService.core", () => {
  it("monta o texto a partir do disco, e só com o que foi fixado", async () => {
    const { memory } = await service();
    const { path } = await memory.write(preferencia);
    await memory.write({
      name: "Endpoint de checkout",
      description: "explicação, não diretriz",
      type: "reference",
      scope: "global",
      body: "POST /v2/checkout",
      actor: "human",
    });
    await memory.pin(path, true);

    const core = await memory.core();

    expect(core.text).toContain("Achado primeiro, explicação depois.");
    // A referência não fixada fica de fora, por mais curta que seja.
    expect(core.text).not.toContain("POST /v2/checkout");
    expect(core.entries).toHaveLength(1);
    expect(core.chars).toBe(core.text.length);
  });

  it("sem nada fixado, o núcleo é vazio", async () => {
    const { memory } = await service();
    await memory.write(preferencia);

    expect((await memory.core()).text).toBe("");
  });

  it("memória fixada que sumiu do disco não derruba o núcleo", async () => {
    const { memory, stateDir, db } = await service();
    const outra = await memory.write(preferencia);
    await memory.pin(outra.path, true);
    const some = await memory.write({
      name: "Não relaxe teste",
      description: "conserte o código",
      type: "feedback",
      body: "Teste vermelho é o código, não o teste.",
      actor: "human",
    });
    await memory.pin(some.path, true);
    rmSync(join(stateDir, some.path));

    const warns: string[] = [];
    const rescue = new MemoryService({
      db: db.db,
      stateDir,
      log: { warn: (_first: unknown, message?: string) => void warns.push(message ?? "") },
    });
    const core = await rescue.core();

    // As outras chegam. Uma memória corrompida não pode calar as nove restantes.
    expect(core.text).toContain("Achado primeiro");
    expect(core.text).not.toContain("Teste vermelho");
    expect(warns.join(" ")).toContain("fora do núcleo");
  });
});

describe("MemoryService.forget — apagar é sempre ação sua (Q29)", () => {
  it("recusa deleção pedida por quem não é humano, e o arquivo fica", async () => {
    const { memory, stateDir } = await service();
    const written = await memory.write(preferencia);

    await expect(
      memory.forget("user", preferencia.name, undefined, { actor: "agent" }),
    ).rejects.toMatchObject({ code: "BLOCKED" });

    // Fechar a escrita e deixar a deleção aberta é fechar a porta da frente e
    // esquecer a dos fundos — e o commit sairia com a sua assinatura.
    expect(statSync(join(stateDir, written.path)).isFile()).toBe(true);
    expect(memory.list()).toHaveLength(1);
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
