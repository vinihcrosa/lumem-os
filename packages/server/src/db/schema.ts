import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    /**
     * Where it was cloned from, sanitized — never with a credential, F6.8.
     *
     * Null means "registered by path, with no known origin". It is the first
     * piece of data Q291 (stable project identity) needs in order to be
     * discussed at all, and what any future `fetch` will read.
     */
    remoteUrl: text("remote_url"),
    /**
     * The Lumem wrote these bytes, into a directory the Lumem chose.
     *
     * A column and not a deduction from `remote_url != null` or from the path's
     * prefix: `project.remove` deletes the directory when this is true (F6.9),
     * and a deduction fails silently the first time somebody moves something —
     * where the failure is deleting somebody else's repository.
     */
    managed: integer("managed", { mode: "boolean" }).notNull().default(false),
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

export const schema = { workspace, project, worktree, agentConfig, session };

export type WorkspaceRow = typeof workspace.$inferSelect;
export type ProjectRow = typeof project.$inferSelect;
export type WorktreeRow = typeof worktree.$inferSelect;
export type AgentConfigRow = typeof agentConfig.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
