import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * The daemon's state, as PRD §6 describes it.
 *
 * Two rules are enforced here rather than in application code, on purpose:
 *
 * - Every foreign key is ON DELETE RESTRICT. The PRD forbids cascading deletes
 *   ("remover projeto exige zero worktrees"), and a rule that lives only in a
 *   procedure is a rule the next procedure forgets.
 * - `state` and `kind` are CHECK constraints, not conventions. A typo in an
 *   UPDATE would otherwise produce a row no reader knows how to interpret.
 *
 * Foreign keys only bite when `PRAGMA foreign_keys = ON`, which SQLite leaves
 * OFF by default. See `db/index.ts`.
 */

/** Milliseconds since the epoch, defaulted by SQLite so no writer can forget. */
const NOW = sql`(unixepoch('subsec') * 1000)`;

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(NOW),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(NOW),
};

export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  ...timestamps,
});

export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Absolute path to the repository root. Unique across every workspace. */
    path: text("path").notNull().unique(),
    /** Resolved once, when the project is added. */
    defaultBranch: text("default_branch").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("project_name_per_workspace").on(table.workspaceId, table.name)],
);

export const worktree = sqliteTable(
  "worktree",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    branch: text("branch").notNull(),
    /** Absolute, and outside the project's own path. */
    path: text("path").notNull(),
    state: text("state").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("worktree_name_per_project").on(table.projectId, table.name),
    check("worktree_state", sql`${table.state} IN ('active', 'missing')`),
  ],
);

export const agentConfig = sqliteTable("agent_config", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  command: text("command").notNull(),
  /** JSON array. SQLite has no list type and a join table would buy nothing. */
  args: text("args", { mode: "json" }).notNull().$type<string[]>().default([]),
  /** JSON object of extra environment variables. */
  env: text("env", { mode: "json" }).notNull().$type<Record<string, string>>().default({}),
  ...timestamps,
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    agentConfigId: text("agent_config_id").references(() => agentConfig.id, {
      onDelete: "restrict",
    }),
    scopeType: text("scope_type").notNull(),
    /**
     * A project id or a worktree id, depending on `scope_type`.
     *
     * No foreign key is possible on a polymorphic column, so "no session
     * orphaned from its scope" is enforced by the session router instead.
     */
    scopeId: text("scope_id").notNull(),
    cwd: text("cwd").notNull(),
    /** What was actually launched, so the detail view never has to guess. */
    command: text("command").notNull(),
    state: text("state").notNull().default("running"),
    exitCode: integer("exit_code"),
    ...timestamps,
  },
  (table) => [
    check("session_kind", sql`${table.kind} IN ('shell', 'agent')`),
    check("session_scope_type", sql`${table.scopeType} IN ('project', 'worktree')`),
    check("session_state", sql`${table.state} IN ('running', 'exited')`),
    // Both directions: an agent session without a config cannot be relaunched
    // or explained, and a shell pointing at one is a lie about what it runs.
    check(
      "session_agent_config",
      sql`(${table.kind} = 'agent' AND ${table.agentConfigId} IS NOT NULL)
        OR (${table.kind} = 'shell' AND ${table.agentConfigId} IS NULL)`,
    ),
    // A running process cannot have an exit code, and an exited one must.
    check(
      "session_exit_code",
      sql`(${table.state} = 'running' AND ${table.exitCode} IS NULL)
        OR (${table.state} = 'exited')`,
    ),
  ],
);

/**
 * O catálogo de memórias — **projeção**, não fonte da verdade.
 *
 * A Q3 decidiu que Markdown no `~/.lumem` é a fonte; esta tabela existe para
 * responder rápido "o que existe" e, mais tarde, para o índice FTS5 da PR 04.
 * Apagar este banco e rodar `reindex` tem que devolver exatamente o mesmo
 * conteúdo — é o `Done when` da T5, e a razão de nada de domínio nascer aqui.
 *
 * Sem foreign key para `workspace` e `project` de propósito: o id de projeto
 * vem do `project.toml` do repositório (Q3.1) e pode existir antes de a linha
 * existir no banco. Uma FK aqui recusaria memória de um projeto que o daemon
 * ainda não registrou — e a fonte da verdade está no disco de qualquer forma.
 */
export const memoryEntry = sqliteTable(
  "memory_entry",
  {
    id: text("id").primaryKey(),
    /** Caminho relativo ao state dir, com barra. É o que o git também usa. */
    path: text("path").notNull().unique(),
    type: text("type").notNull(),
    scope: text("scope").notNull(),
    /** A segunda metade da identidade `(tipo, slug)` da Q12. */
    slug: text("slug").notNull(),
    workspaceId: text("workspace_id"),
    projectId: text("project_id"),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Do frontmatter, para responder "por que esta memória existe" sem abrir o arquivo. */
    sourceActor: text("source_actor").notNull(),
    confidence: text("confidence").notNull(),
    /** sha256 do arquivo inteiro: o `reindex` pula o que não mudou. */
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "memory_entry_type",
      sql`${table.type} IN ('user', 'feedback', 'project', 'domain', 'process', 'contract', 'reference')`,
    ),
    check("memory_entry_scope", sql`${table.scope} IN ('global', 'workspace', 'project')`),
    // A identidade da Q12 é única dentro do escopo em que ela vale.
    uniqueIndex("memory_entry_identity").on(
      table.scope,
      table.workspaceId,
      table.projectId,
      table.type,
      table.slug,
    ),
  ],
);

/**
 * O WAL de decisões de memória — **magro**, como a Q37 decidiu.
 *
 * Com o `~/.lumem` versionado por git (Q36), o conteúdo anterior é o commit
 * anterior: guardar `prior_content` aqui seria manter dois históricos do mesmo
 * texto. O que esta tabela guarda é a **decisão** — origem, regra que bateu,
 * confiança, idempotência, resultado — e o SHA que ela produziu.
 *
 * E guarda o que o git não tem como guardar: **rejeição e no-op**. Escrita
 * barrada pelo scan nunca vira arquivo, então ela só existe aqui — e é
 * exatamente o que se pergunta depois ("por que isso não foi salvo?").
 */
export const memoryDecision = sqliteTable(
  "memory_decision",
  {
    id: text("id").primaryKey(),
    /** Repetir a mesma decisão é no-op, e é o que torna o replay seguro. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Caminho relativo ao state dir. Presente mesmo em rejeição: é o alvo pretendido. */
    path: text("path").notNull(),
    operation: text("operation").notNull(),
    outcome: text("outcome").notNull(),
    /** Quem pediu: `human`, `agent`, `distiller`, `auto_research`, `import`. */
    actor: text("actor").notNull(),
    confidence: text("confidence").notNull(),
    /** sha256 do conteúdo candidato — dedupe sem guardar o conteúdo. */
    candidateHash: text("candidate_hash").notNull(),
    /** As regras que o scan achou, por nome. Nunca o texto que casou. */
    ruleTrace: text("rule_trace", { mode: "json" }).notNull().$type<string[]>().default([]),
    /** Por que não foi aplicada, quando não foi. */
    reason: text("reason"),
    /** O commit no `~/.lumem`. Nulo quando não houve escrita, ou quando o git falhou. */
    commitSha: text("commit_sha"),
    ...timestamps,
  },
  (table) => [
    check("memory_decision_operation", sql`${table.operation} IN ('add', 'update', 'delete')`),
    check(
      "memory_decision_outcome",
      sql`${table.outcome} IN ('applied', 'noop', 'rejected')`,
    ),
  ],
);

/**
 * O registro de acesso cross-projeto (D8).
 *
 * Guarda **os dois** casos: o que foi permitido responde "o que foi lido"; o que
 * foi negado responde "o que alguém tentou ler" — e é essa a pergunta que
 * importa quando algo dá errado.
 */
export const memoryAccess = sqliteTable(
  "memory_access",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    /** Quem pediu — o projeto da sessão. */
    fromProjectId: text("from_project_id"),
    /** O que ele quis alcançar. */
    targetProjectId: text("target_project_id"),
    kind: text("kind").notNull(),
    /** O alvo pedido: identidade de memória, ou caminho de arquivo. */
    target: text("target").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    actor: text("actor").notNull(),
    ...timestamps,
  },
  (table) => [
    check("memory_access_kind", sql`${table.kind} IN ('memory', 'repository')`),
    check("memory_access_decision", sql`${table.decision} IN ('allowed', 'denied')`),
  ],
);

/**
 * O sinal de uso (Q25) — o insumo objetivo de toda poda e consolidação futura.
 *
 * O Compozy promove só o que o recall já validou: *memória nunca recuperada
 * nunca é promovida*. Sem estes contadores, consolidar vira o LLM chutando o
 * que é importante — e é a diferença entre um sistema que aprende o que usa e
 * um que acumula o que gerou.
 */
export const memorySignal = sqliteTable("memory_signal", {
  /** O caminho é a chave: ele já é único no catálogo, e sobrevive ao reindex. */
  path: text("path").primaryKey(),
  recallCount: integer("recall_count").notNull().default(0),
  lastRecalledAt: integer("last_recalled_at", { mode: "timestamp_ms" }),
  /** O melhor score que esta memória já teve numa busca. */
  bestScore: real("best_score").notNull().default(0),
  ...timestamps,
});

/**
 * A instrumentação do §6 do context-delivery.
 *
 * O número que mais importa é "quantas vezes o agente perguntou": perto de zero
 * significa que a camada 3 é decoração, e que o desenho precisa mudar. Medir é
 * o que separa decidir com dado de decidir com fé.
 */
export const memoryUsage = sqliteTable("memory_usage", {
  id: text("id").primaryKey(),
  /** `recall`, `read`, `write`, `inject` — o que foi feito. */
  kind: text("kind").notNull(),
  /** A sessão que originou, quando houver. */
  sessionId: text("session_id"),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  /** Quantos resultados a busca devolveu, ou quantos caracteres foram injetados. */
  amount: integer("amount").notNull().default(0),
  /** Quanto tempo custou, em milissegundos. */
  durationMs: integer("duration_ms").notNull().default(0),
  ...timestamps,
});

export const schema = {
  workspace,
  project,
  worktree,
  agentConfig,
  session,
  memoryEntry,
  memoryDecision,
  memoryAccess,
  memorySignal,
  memoryUsage,
};

export type WorkspaceRow = typeof workspace.$inferSelect;
export type ProjectRow = typeof project.$inferSelect;
export type WorktreeRow = typeof worktree.$inferSelect;
export type AgentConfigRow = typeof agentConfig.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type MemoryEntryRow = typeof memoryEntry.$inferSelect;
export type MemoryDecisionRow = typeof memoryDecision.$inferSelect;
export type MemoryAccessRow = typeof memoryAccess.$inferSelect;
export type MemorySignalRow = typeof memorySignal.$inferSelect;
export type MemoryUsageRow = typeof memoryUsage.$inferSelect;
