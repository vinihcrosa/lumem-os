import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { newId } from "@lumem/shared";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type Db, type Database_ } from "./index.js";
import { agentConfig, memoryProposal, project, session, task, workspace, worktree } from "./schema.js";

const open: Database_[] = [];
const dirs: string[] = [];

/** A live configuration always pins its adapter (`033` F1.1). The value is noise here. */
const PIN = "0.75.1";

/** A database of its own per test — the parallel-safety the matrix promises. */
function freshDatabase(): { db: Db; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "lumem-db-"));
  dirs.push(dir);
  const path = join(dir, "lumem.db");
  const handle = openDatabase({ path });
  open.push(handle);
  return { db: handle.db, path };
}

afterEach(() => {
  for (const handle of open.splice(0)) handle.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function seedWorkspace(db: Db, name = "pessoal"): Promise<string> {
  const id = newId();
  await db.insert(workspace).values({ id, name });
  return id;
}

async function seedProject(db: Db, workspaceId: string, overrides: Partial<{ name: string; path: string }> = {}) {
  const id = newId();
  await db.insert(project).values({
    id,
    workspaceId,
    name: overrides.name ?? "lorebase",
    path: overrides.path ?? `/repos/${id}`,
    defaultBranch: "main",
  });
  return id;
}

describe("migration", () => {
  it("creates every table the model needs", async () => {
    const { db } = freshDatabase();

    const tables = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );

    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining(["agent_config", "project", "session", "workspace", "worktree"]),
    );
  });

  it("is idempotent across restarts", async () => {
    const { path } = freshDatabase();
    const workspaceId = await seedWorkspace(open[0]!.db);

    // Reopening is what every daemon start does.
    const reopened = openDatabase({ path });
    open.push(reopened);

    expect(await reopened.db.select().from(workspace)).toHaveLength(1);
    expect((await reopened.db.select().from(workspace))[0]?.id).toBe(workspaceId);
  });

  it("stamps rows with a creation time", async () => {
    const { db } = freshDatabase();
    const before = Date.now();

    await seedWorkspace(db);

    const [row] = await db.select().from(workspace);
    expect(row?.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });
});

describe("uniqueness", () => {
  it("refuses two workspaces with the same name", async () => {
    const { db } = freshDatabase();
    await seedWorkspace(db, "pessoal");

    await expect(seedWorkspace(db, "pessoal")).rejects.toThrow(/UNIQUE/i);
  });

  it("refuses the same repository path in two workspaces", async () => {
    // The path is what identifies a repo on disk; registering it twice would
    // give one repository two sets of worktrees.
    const { db } = freshDatabase();
    const a = await seedWorkspace(db, "a");
    const b = await seedWorkspace(db, "b");
    await seedProject(db, a, { path: "/repos/lorebase" });

    await expect(seedProject(db, b, { path: "/repos/lorebase" })).rejects.toThrow(/UNIQUE/i);
  });

  it("refuses two projects with the same name in one workspace", async () => {
    const { db } = freshDatabase();
    const workspaceId = await seedWorkspace(db);
    await seedProject(db, workspaceId, { name: "lorebase", path: "/repos/one" });

    await expect(
      seedProject(db, workspaceId, { name: "lorebase", path: "/repos/two" }),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("allows the same project name in different workspaces", async () => {
    const { db } = freshDatabase();
    const a = await seedWorkspace(db, "a");
    const b = await seedWorkspace(db, "b");
    await seedProject(db, a, { name: "lorebase", path: "/repos/one" });

    await expect(
      seedProject(db, b, { name: "lorebase", path: "/repos/two" }),
    ).resolves.toBeDefined();
  });

  it("refuses two worktrees with the same name in one project", async () => {
    const { db } = freshDatabase();
    const projectId = await seedProject(db, await seedWorkspace(db));
    const values = { projectId, name: "teste", branch: "teste", path: "/w/teste" };
    await db.insert(worktree).values({ id: newId(), ...values });

    await expect(
      db.insert(worktree).values({ id: newId(), ...values, path: "/w/other" }),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("refuses two agent configs with the same name", async () => {
    const { db } = freshDatabase();
    await db.insert(agentConfig).values({
      id: newId(),
      name: "claude-code",
      command: "claude",
      adapterVersion: PIN,
    });

    await expect(
      db.insert(agentConfig).values({
        id: newId(),
        name: "claude-code",
        command: "other",
        adapterVersion: PIN,
      }),
    ).rejects.toThrow(/UNIQUE/i);
  });
});

describe("referential integrity", () => {
  it("refuses to delete a workspace that still has projects", async () => {
    // The PRD forbids cascading deletes. Enforced by the database, because a
    // rule that lives only in a procedure is one the next procedure forgets.
    const { db } = freshDatabase();
    const workspaceId = await seedWorkspace(db);
    await seedProject(db, workspaceId);

    await expect(db.delete(workspace)).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("refuses to delete a project that still has worktrees", async () => {
    const { db } = freshDatabase();
    const projectId = await seedProject(db, await seedWorkspace(db));
    await db
      .insert(worktree)
      .values({ id: newId(), projectId, name: "t", branch: "t", path: "/w/t" });

    await expect(db.delete(project)).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("refuses a project pointing at a workspace that does not exist", async () => {
    const { db } = freshDatabase();

    await expect(seedProject(db, "no-such-workspace")).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("refuses to delete an agent config still referenced by a session", async () => {
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({
      id: configId,
      name: "claude-code",
      command: "claude",
      adapterVersion: PIN,
    });
    await db.insert(session).values({
      id: newId(),
      kind: "agent",
      agentConfigId: configId,
      scopeType: "worktree",
      scopeId: "w1",
      cwd: "/w/t",
      command: "claude",
    });

    await expect(db.delete(agentConfig)).rejects.toThrow(/FOREIGN KEY/i);
  });
});

/**
 * A configuração de agente sem transporte (`033` F1.1, ADR de 2026-09-24).
 *
 * Agente é sempre ACP, então a coluna que dizia *como* falar com ele saiu, e o
 * que sobra é a diferença entre uma configuração viva — que sobe um adaptador,
 * e por isso precisa do pino — e uma aposentada, que é o registro de uma
 * configuração PTY de antes e não sobe nada.
 */
describe("agent configuration", () => {
  it("refuses a live configuration with no pinned adapter version", async () => {
    // F5.5 and A12: an adapter that changes under a running session is the
    // definition of an invisible failure, so `@latest` is not expressible.
    const { db } = freshDatabase();

    await expect(
      db.insert(agentConfig).values({
        id: newId(),
        name: "claude-acp",
        command: "claude-agent-acp",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("accepts a live configuration that pins its adapter", async () => {
    const { db } = freshDatabase();
    await db.insert(agentConfig).values({
      id: newId(),
      name: "claude-acp",
      command: "claude-agent-acp",
      adapterVersion: "0.69.0",
    });

    const [row] = await db.select().from(agentConfig);

    expect(row).toMatchObject({ adapterVersion: "0.69.0", retiredAt: null });
  });

  it("accepts a retired configuration with no adapter version", async () => {
    // O que a `0033` produz de uma linha PTY: ela nunca teve pino, e não vai
    // passar a ter um — ela não sobe mais nada.
    const { db } = freshDatabase();
    const retiredAt = new Date(1_790_000_000_000);
    await db.insert(agentConfig).values({
      id: newId(),
      name: "claude-code",
      command: "claude",
      retiredAt,
    });

    const [row] = await db.select().from(agentConfig);

    expect(row).toMatchObject({ adapterVersion: null, retiredAt });
  });

  it("has no transport column any more", async () => {
    const { db } = freshDatabase();

    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(agent_config)`);

    expect(columns.map((column) => column.name)).not.toContain("transport");
    expect(columns.map((column) => column.name)).toContain("retired_at");
  });
});

/**
 * O primeiro prompt que espera o `setup` (`033` §3.3).
 *
 * O motivo é um conjunto fechado: um leitor que não conhece o valor não sabe
 * que botão desenhar, então o banco recusa antes.
 */
describe("pending prompt", () => {
  function agentSessionValues(configId: string) {
    return {
      id: newId(),
      kind: "agent",
      agentConfigId: configId,
      scopeType: "worktree",
      scopeId: "w1",
      cwd: "/w/t",
      command: "claude-agent-acp",
      transport: "acp",
      acpSessionId: "d81b05ee",
    };
  }

  async function seedConfig(db: Db): Promise<string> {
    const id = newId();
    await db.insert(agentConfig).values({
      id,
      name: "claude",
      command: "claude-agent-acp",
      adapterVersion: PIN,
    });
    return id;
  }

  it("a session starts with nothing pending", async () => {
    const { db } = freshDatabase();
    await db.insert(session).values(agentSessionValues(await seedConfig(db)));

    const [row] = await db.select().from(session);

    expect(row).toMatchObject({ pendingPrompt: null, pendingReason: null });
  });

  it("keeps a pending prompt, and the one reason the daemon knows", async () => {
    const { db } = freshDatabase();
    await db.insert(session).values({
      ...agentSessionValues(await seedConfig(db)),
      pendingPrompt: "corrigir o bug do login no Safari",
      pendingReason: "setup_failed",
    });

    const [row] = await db.select().from(session);

    expect(row).toMatchObject({
      pendingPrompt: "corrigir o bug do login no Safari",
      pendingReason: "setup_failed",
    });
  });

  it("refuses a pending reason outside the closed set", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        ...agentSessionValues(await seedConfig(db)),
        pendingPrompt: "corrigir o bug",
        pendingReason: "setup_slow",
      }),
    ).rejects.toThrow(/CHECK/i);
  });
});

describe("transport", () => {
  it("defaults a session to PTY and keeps its ACP fields empty", async () => {
    const { db } = freshDatabase();
    await db.insert(session).values({
      id: newId(),
      kind: "shell",
      scopeType: "project",
      scopeId: "p1",
      cwd: "/repo",
      command: "/bin/zsh",
    });

    const [row] = await db.select().from(session);

    expect(row).toMatchObject({ transport: "pty", acpSessionId: null, mode: null, model: null });
  });

  it("refuses an ACP session with no ACP session id", async () => {
    // D1: the row records what the session *is*, and an ACP session without the
    // adapter's own id cannot be reconciled on the next boot.
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({
      id: configId,
      name: "claude-acp",
      command: "claude-agent-acp",
      adapterVersion: "0.69.0",
    });

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "agent",
        agentConfigId: configId,
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "claude-agent-acp",
        transport: "acp",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("refuses a PTY session carrying an ACP session id", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/zsh",
        transport: "pty",
        acpSessionId: "d81b05ee",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("refuses a shell session on ACP", async () => {
    // F1.2: a shell is always a PTY. There is no conversation to have with one.
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/zsh",
        transport: "acp",
        acpSessionId: "d81b05ee",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("accepts an ACP agent session with the adapter's session id", async () => {
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({
      id: configId,
      name: "claude-acp",
      command: "claude-agent-acp",
      adapterVersion: "0.69.0",
    });
    await db.insert(session).values({
      id: newId(),
      kind: "agent",
      agentConfigId: configId,
      scopeType: "worktree",
      scopeId: "w1",
      cwd: "/w/t",
      command: "claude-agent-acp",
      transport: "acp",
      acpSessionId: "d81b05ee",
      mode: "auto",
      model: "opus[1m]",
    });

    const [row] = await db.select().from(session);

    expect(row).toMatchObject({
      transport: "acp",
      acpSessionId: "d81b05ee",
      mode: "auto",
      model: "opus[1m]",
    });
  });
});

describe("state constraints", () => {
  it("rejects a worktree state the code cannot interpret", async () => {
    const { db } = freshDatabase();
    const projectId = await seedProject(db, await seedWorkspace(db));

    await expect(
      db.insert(worktree).values({
        id: newId(),
        projectId,
        name: "t",
        branch: "t",
        path: "/w/t",
        state: "zombie",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  /**
   * A sessão de script (project-scripts T4). Ela é `pty` e sem configuração de
   * agente como a shell, e o que a distingue é a fase — que o CHECK cobra nos dois
   * sentidos, porque script sem fase é sessão que o rodapé não sabe onde mostrar.
   */
  it("accepts a script session carrying its phase", async () => {
    const { db } = freshDatabase();
    await db.insert(session).values({
      id: newId(),
      kind: "script",
      scriptName: "run",
      scopeType: "worktree",
      scopeId: "w1",
      cwd: "/w/t",
      command: "pnpm dev",
    });

    const [row] = await db.select().from(session);

    expect(row).toMatchObject({ kind: "script", scriptName: "run", transport: "pty" });
  });

  it("rejects a script session with no phase", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "script",
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "pnpm dev",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a phase the daemon has no tab for", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "script",
        scriptName: "deploy",
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "./deploy.sh",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a shell claiming to be a script phase", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scriptName: "run",
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "/bin/zsh",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a script session pointing at an agent configuration", async () => {
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({
      id: configId,
      name: "claude",
      command: "claude",
      adapterVersion: PIN,
    });

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "script",
        scriptName: "setup",
        agentConfigId: configId,
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "./setup.sh",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects an agent session with no configuration", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "agent",
        scopeType: "worktree",
        scopeId: "w1",
        cwd: "/w/t",
        command: "claude",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a shell session that claims an agent configuration", async () => {
    const { db } = freshDatabase();
    const configId = newId();
    await db.insert(agentConfig).values({
      id: configId,
      name: "claude-code",
      command: "claude",
      adapterVersion: PIN,
    });

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        agentConfigId: configId,
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/zsh",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a scope type that is neither project nor worktree", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "workspace",
        scopeId: "x",
        cwd: "/repo",
        command: "/bin/sh",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("rejects a running session that already has an exit code", async () => {
    const { db } = freshDatabase();

    await expect(
      db.insert(session).values({
        id: newId(),
        kind: "shell",
        scopeType: "project",
        scopeId: "p1",
        cwd: "/repo",
        command: "/bin/sh",
        exitCode: 0,
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  // Aprovar uma proposta faz `proposal.type as MemoryType` — um cast que compila
  // em silêncio sobre qualquer string. O banco é o último lugar que consegue
  // recusar a string antes de ela virar arquivo, e uma guarda sem teste é uma
  // guarda que ninguém sabe se está ligada.
  const proposal = {
    path: "workspaces/ws1/memory/domain_plano.md",
    type: "domain",
    scope: "workspace",
    slug: "plano",
    name: "Plano sem preço",
    description: "Usuário sem plano ativo vê catálogo, não preço",
    actor: "agent",
    confidence: "medium",
  } as const;

  it.each([
    ["type", { type: "nao_existe_na_taxonomia" }],
    ["scope", { scope: "marte" }],
    ["actor", { actor: "marciano" }],
    ["confidence", { confidence: "altissima" }],
    ["status", { status: "quase" }],
  ])("rejects a proposal whose %s is outside the closed set", async (_column, invalid) => {
    const { db } = freshDatabase();

    await expect(
      db.insert(memoryProposal).values({ id: newId(), ...proposal, ...invalid }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("accepts every value the taxonomy does allow", async () => {
    const { db } = freshDatabase();

    // O par do teste acima: sem ele, um typo dentro de uma das listas só
    // apareceria para os valores que o resto da suíte exercita.
    for (const type of ["user", "feedback", "project", "domain", "process", "contract", "reference"]) {
      for (const scope of ["global", "workspace", "project"]) {
        for (const actor of ["human", "agent", "distiller", "auto_research", "import"]) {
          for (const confidence of ["low", "medium", "high"]) {
            await db
              .insert(memoryProposal)
              .values({ id: newId(), ...proposal, type, scope, actor, confidence });
          }
        }
      }
    }

    const [row] = await db.all<{ total: number }>(
      sql`SELECT count(*) AS total FROM memory_proposal`,
    );
    expect(row?.total).toBe(7 * 3 * 5 * 3);
  });

  it("stores agent arguments and environment as structured values", async () => {
    const { db } = freshDatabase();
    await db.insert(agentConfig).values({
      id: newId(),
      name: "claude-code",
      command: "claude",
      args: ["--verbose"],
      env: { ANTHROPIC_LOG: "debug" },
      adapterVersion: PIN,
    });

    const [row] = await db.select().from(agentConfig);

    expect(row?.args).toEqual(["--verbose"]);
    expect(row?.env).toEqual({ ANTHROPIC_LOG: "debug" });
  });
});

/**
 * Tarefa como entidade (`022-workspace-tasks` T4).
 *
 * O que este bloco prova não é "a tabela existe": é que as três regras que o
 * §3.1 da PRD pôs **no banco** recusam de verdade, e que as duas exceções à
 * regra do RESTRICT fazem o que dizem. A mais frágil delas é a última — o
 * `drizzle-kit` perde a ação do FK no caminho de `ALTER TABLE`, e sem o teste a
 * coluna nasceria NO ACTION sem ninguém notar.
 */
describe("tarefa", () => {
  async function seedWorktree(db: Db, projectId: string, name = "feat"): Promise<string> {
    const id = newId();
    await db.insert(worktree).values({ id, projectId, name, branch: name, path: `/wt/${id}` });
    return id;
  }

  async function seedShell(db: Db, scopeId: string, taskId?: string): Promise<string> {
    const id = newId();
    await db.insert(session).values({
      id,
      kind: "shell",
      scopeType: "worktree",
      scopeId,
      cwd: "/wt",
      command: "bash",
      taskId,
    });
    return id;
  }

  async function seedTask(db: Db, values: Record<string, unknown> = {}) {
    const workspaceId = (values.workspaceId as string | undefined) ?? (await seedWorkspace(db));
    const projectId = (values.projectId as string | undefined) ?? (await seedProject(db, workspaceId));
    const id = newId();
    await db.insert(task).values({ id, workspaceId, projectId, title: "consertar o /orders", ...values });
    return { id, workspaceId, projectId };
  }

  it("recusa um estado que nenhum leitor sabe interpretar", async () => {
    const { db } = freshDatabase();

    await expect(seedTask(db, { status: "quase" })).rejects.toThrow(/CHECK/i);
  });

  it("recusa tarefa de agente sem a sessão que a propôs", async () => {
    const { db } = freshDatabase();

    // Proveniência é o que separa proposta de lixo: sem ela, a triagem não tem
    // como responder "quem propôs isto, e de onde".
    await expect(seedTask(db, { createdBy: "agent" })).rejects.toThrow(/CHECK/i);
  });

  it("recusa tarefa sua carregando uma sessão", async () => {
    const { db } = freshDatabase();

    await expect(seedTask(db, { createdBy: "human", createdBySession: newId() })).rejects.toThrow(
      /CHECK/i,
    );
  });

  it("recusa done sem data de fechamento, e data com a tarefa aberta", async () => {
    const { db } = freshDatabase();

    const workspaceId = await seedWorkspace(db, "acme");
    const projectId = await seedProject(db, workspaceId);

    await expect(seedTask(db, { workspaceId, projectId, status: "done" })).rejects.toThrow(/CHECK/i);
    await expect(
      seedTask(db, { workspaceId, projectId, status: "open", closedAt: new Date() }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("recusa remover um projeto que ainda tem tarefas", async () => {
    const { db } = freshDatabase();
    const { projectId } = await seedTask(db);

    // RESTRICT, como todo FK deste schema. A cascata é a ordem de dois deletes
    // numa transação — do repositório, não do banco.
    await expect(db.delete(project).where(eq(project.id, projectId))).rejects.toThrow(
      /FOREIGN KEY/i,
    );
  });

  it("perder a worktree não muda o estado da tarefa", async () => {
    const { db } = freshDatabase();
    const workspaceId = await seedWorkspace(db);
    const projectId = await seedProject(db, workspaceId);
    const worktreeId = await seedWorktree(db, projectId);
    const { id } = await seedTask(db, { workspaceId, projectId, worktreeId, status: "in_progress" });

    await db.delete(worktree).where(eq(worktree.id, worktreeId));

    const [row] = await db.select().from(task).where(eq(task.id, id));
    expect(row?.worktreeId).toBeNull();
    // Voltar para `open` apagaria o fato de que alguém trabalhou nela — e o
    // custo, que continua somado, diria o contrário da coluna de estado.
    expect(row?.status).toBe("in_progress");
  });

  it("a sessão sobrevive à tarefa, com o ponteiro nulo", async () => {
    const { db } = freshDatabase();
    const workspaceId = await seedWorkspace(db);
    const projectId = await seedProject(db, workspaceId);
    const worktreeId = await seedWorktree(db, projectId);
    const { id } = await seedTask(db, { workspaceId, projectId });
    const sessionId = await seedShell(db, worktreeId, id);

    // O `ON DELETE SET NULL` que o `drizzle-kit` apagou do ALTER TABLE. Sem a
    // ação, este delete falharia com FOREIGN KEY em vez de anular a coluna.
    await db.delete(task).where(eq(task.id, id));

    const [row] = await db.select().from(session).where(eq(session.id, sessionId));
    expect(row).toBeDefined();
    expect(row?.taskId).toBeNull();
  });
});
