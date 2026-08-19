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

export const agentConfig = sqliteTable(
  "agent_config",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    command: text("command").notNull(),
    /** JSON array. SQLite has no list type and a join table would buy nothing. */
    args: text("args", { mode: "json" }).notNull().$type<string[]>().default([]),
    /** JSON object of extra environment variables. */
    env: text("env", { mode: "json" }).notNull().$type<Record<string, string>>().default({}),
    /**
     * How the daemon talks to this agent.
     *
     * Defaults to `pty` so that migrating an existing row changes nothing about
     * how it behaves (A11): every configuration that already worked was a PTY
     * configuration, and a default of `acp` would silently re-point it at a
     * transport it was never tested on.
     */
    transport: text("transport").notNull().default("pty"),
    /**
     * The ACP adapter version, pinned.
     *
     * Never `@latest` (A12, F5.5). The adapter publishes almost daily, and one
     * that changes underneath a running session is the definition of an
     * invisible failure — so the version is data, and updating it is an act.
     */
    adapterVersion: text("adapter_version"),
    ...timestamps,
  },
  (table) => [
    check("agent_config_transport", sql`${table.transport} IN ('pty', 'acp')`),
    // Both directions. An ACP row with no version cannot be launched
    // reproducibly; a PTY row with one makes a claim about something it never
    // runs, and the next reader has no way to tell that it is noise.
    check(
      "agent_config_adapter_version",
      sql`(${table.transport} = 'acp' AND ${table.adapterVersion} IS NOT NULL)
        OR (${table.transport} = 'pty' AND ${table.adapterVersion} IS NULL)`,
    ),
  ],
);

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
    /**
     * What this session *is*, not what its configuration currently asks for.
     *
     * Denormalised from `agent_config` on purpose (D1): transport is chosen when
     * the session is born and never changes, and boot reconciliation has to know
     * which manager owns a row without going back to a configuration that may
     * have been edited since.
     */
    transport: text("transport").notNull().default("pty"),
    /** The adapter's own session id. Only an ACP session has one. */
    acpSessionId: text("acp_session_id"),
    /** Current permission mode and model, as the protocol reports them. */
    mode: text("mode"),
    model: text("model"),
    /**
     * The session this one continues (F5.2, D12).
     *
     * `session/load` does not resurrect yesterday's process: it starts a new adapter
     * and tells it which conversation to load. So resuming produces a *new* row that
     * carries the old one's `acp_session_id` and points back at it — the conversation
     * continues, and the session that died stays dead with its transcript intact.
     *
     * No foreign key, deliberately. This is provenance, not a dependency: deleting
     * yesterday's session should not be blocked by the fact that today's continues
     * it, and `ON DELETE RESTRICT` — the only cascade rule this schema allows — would
     * do exactly that to a purge. The invariant that a resumed session is an ACP one
     * lives in the session store, which is also the only thing that can write this.
     */
    resumedFromId: text("resumed_from_id"),
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
    check("session_transport", sql`${table.transport} IN ('pty', 'acp')`),
    // A shell is always a PTY (F1.2). There is no conversation to have with one,
    // and letting the column say otherwise would put a shell in front of the
    // conversation renderer.
    check("session_shell_transport", sql`${table.kind} = 'agent' OR ${table.transport} = 'pty'`),
    // Both directions again: an ACP session without the adapter's id cannot be
    // reconciled after a restart, and a PTY session carrying one is claiming a
    // conversation that does not exist.
    check(
      "session_acp_id",
      sql`(${table.transport} = 'acp' AND ${table.acpSessionId} IS NOT NULL)
        OR (${table.transport} = 'pty' AND ${table.acpSessionId} IS NULL)`,
    ),
  ],
);

export const schema = { workspace, project, worktree, agentConfig, session };

export type WorkspaceRow = typeof workspace.$inferSelect;
export type ProjectRow = typeof project.$inferSelect;
export type WorktreeRow = typeof worktree.$inferSelect;
export type AgentConfigRow = typeof agentConfig.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
