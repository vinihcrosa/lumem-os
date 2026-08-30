import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS_DIR, openDatabase, type Database_ } from "./index.js";
import { schema } from "./schema.js";

/**
 * The upgrade path a real database takes.
 *
 * `db.test.ts` proves the schema is right once every migration has run. That is
 * a different claim from "an existing database survives being upgraded", and
 * only this file makes the second one: it stops at an older revision, writes
 * rows the way that revision would have, and then runs the rest.
 *
 * It exists because the first generated version of `0001` did not survive it.
 * The rebuild it produced copied rows with
 * `SELECT "transport" FROM agent_config` — reading a column that, by
 * definition, does not exist yet in the table being migrated *from*. Every test
 * that starts from an empty file passes that migration, because there is
 * nothing to copy.
 */

const open: Database_[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const handle of open.splice(0)) handle.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A migrations folder holding the first `count` revisions and no more. */
function migrationsUpTo(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-migrations-"));
  dirs.push(dir);
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });

  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { tag: string }[];
  };

  const kept = journal.entries.slice(0, count);
  for (const entry of journal.entries.slice(count)) {
    rmSync(join(dir, `${entry.tag}.sql`), { force: true });
  }
  mkdirSync(join(dir, "meta"), { recursive: true });
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: kept }));

  return dir;
}

/**
 * A database stopped at revision 0000, holding the rows a user would have.
 *
 * Raw SQL rather than the repositories: the repositories describe today's
 * schema, and the point is to write what *yesterday's* schema allowed.
 */
function databaseAtInitialRevision(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-legacy-db-"));
  dirs.push(dir);
  const path = join(dir, "lumem.db");

  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: migrationsUpTo(1) });

  sqlite
    .prepare(
      `INSERT INTO agent_config (id, name, command, args, env)
       VALUES ('cfg-1', 'claude-code', 'claude', '[]', '{}')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO workspace (id, name) VALUES ('ws-1', 'pessoal')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO project (id, workspace_id, name, path, default_branch)
       VALUES ('pr-1', 'ws-1', 'lorebase', '/repos/lorebase', 'main')`,
    )
    .run();
  // An agent session pointing at that configuration, and a shell beside it.
  // The agent one is what makes the foreign key real during the rebuild.
  sqlite
    .prepare(
      `INSERT INTO session (id, kind, agent_config_id, scope_type, scope_id, cwd, command, state)
       VALUES ('se-1', 'agent', 'cfg-1', 'project', 'pr-1', '/repos/lorebase', 'claude', 'running')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO session (id, kind, scope_type, scope_id, cwd, command, state, exit_code)
       VALUES ('se-2', 'shell', 'project', 'pr-1', '/repos/lorebase', '/bin/zsh', 'exited', 0)`,
    )
    .run();
  sqlite.close();

  return path;
}

describe("0001 — transport", () => {
  it("upgrades a database that already has rows", async () => {
    const path = databaseAtInitialRevision();

    const handle = openDatabase({ path });
    open.push(handle);

    const configs = await handle.db.select().from(schema.agentConfig);
    expect(configs).toHaveLength(1);
  });

  it("leaves every existing configuration on the transport it already used", async () => {
    // A11: migrating is not a behaviour change. Nothing here was ever ACP.
    const path = databaseAtInitialRevision();
    const handle = openDatabase({ path });
    open.push(handle);

    const [config] = await handle.db.select().from(schema.agentConfig);

    expect(config).toMatchObject({
      name: "claude-code",
      transport: "pty",
      adapterVersion: null,
    });
  });

  it("leaves every existing session on PTY, with no conversation attached", async () => {
    const path = databaseAtInitialRevision();
    const handle = openDatabase({ path });
    open.push(handle);

    const sessions = await handle.db.select().from(schema.session);

    expect(sessions).toHaveLength(2);
    for (const row of sessions) {
      expect(row).toMatchObject({
        transport: "pty",
        acpSessionId: null,
        mode: null,
        model: null,
      });
    }
  });

  it("keeps the session pointing at its configuration through the rebuild", async () => {
    // The rebuild drops and recreates both tables. A foreign key that survives
    // an empty database says nothing about one that has to survive a row.
    const path = databaseAtInitialRevision();
    const handle = openDatabase({ path });
    open.push(handle);

    const [agentSession] = await handle.db
      .select()
      .from(schema.session)
      .where(eq(schema.session.id, "se-1"));

    expect(agentSession?.agentConfigId).toBe("cfg-1");
  });

  it("keeps what the rows already said about themselves", async () => {
    // A rebuild that silently reset `state` or `exit_code` would be invisible
    // in a test that only counted rows.
    const path = databaseAtInitialRevision();
    const handle = openDatabase({ path });
    open.push(handle);

    const sessions = await handle.db.select().from(schema.session);
    const byId = new Map(sessions.map((row) => [row.id, row]));

    expect(byId.get("se-1")).toMatchObject({ state: "running", exitCode: null, kind: "agent" });
    expect(byId.get("se-2")).toMatchObject({ state: "exited", exitCode: 0, kind: "shell" });
  });

  it("hands back a handle with foreign keys enforced again", () => {
    // Migrating requires enforcement off, which makes "did it come back on" a
    // real question. If it did not, every ON DELETE RESTRICT in the schema would
    // be inert and the daemon would happily orphan rows.
    const path = databaseAtInitialRevision();
    const handle = openDatabase({ path });
    open.push(handle);

    // Asked of the handle that will actually be used, not of a second
    // connection: the pragma is per-connection, so only this one's answer means
    // anything. Insert a child pointing nowhere and see whether it is refused.
    let thrown: unknown;
    try {
      handle.db.run(
        sql`INSERT INTO session (id, kind, agent_config_id, scope_type, scope_id, cwd, command)
            VALUES ('se-3', 'agent', 'cfg-does-not-exist', 'project', 'pr-1', '/r', 'claude')`,
      );
    } catch (error) {
      thrown = error;
    }

    // Drizzle wraps the driver error, so the reason is in the cause. Matching on
    // the wrapper's own message would pass even if the insert had failed for
    // some unrelated reason.
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).cause)).toMatch(/FOREIGN KEY/i);
  });

  it("refuses to hand back a database a migration left inconsistent", () => {
    // The guard that makes turning enforcement off acceptable. Simulated by
    // orphaning a row before the upgrade runs, which is what a wrong rebuild
    // would leave behind.
    const path = databaseAtInitialRevision();
    const legacy = new Database(path);
    legacy.pragma("foreign_keys = OFF");
    legacy.exec(
      `INSERT INTO session (id, kind, agent_config_id, scope_type, scope_id, cwd, command, state)
       VALUES ('se-orphan', 'agent', 'cfg-gone', 'project', 'pr-1', '/r', 'claude', 'running')`,
    );
    legacy.close();

    expect(() => openDatabase({ path })).toThrow(/órfã/i);
  });

  it("is idempotent — reopening does not migrate again", async () => {
    const path = databaseAtInitialRevision();
    const first = openDatabase({ path });
    first.close();

    const second = openDatabase({ path });
    open.push(second);

    expect(await second.db.select().from(schema.session)).toHaveLength(2);
  });
});

describe("0007 — a origem e a gerência do projeto", () => {
  /**
   * Um banco parado na 0001, com as linhas que um usuário teria.
   *
   * O mesmo `migrationsUpTo` do bloco acima: o ponto de parada é o que muda, e
   * o que se prova é que as colunas novas chegam com default em cima de linha
   * que já existia — não que elas existem num banco vazio.
   */
  function databaseBeforeOrigin(): string {
    const dir = mkdtempSync(join(tmpdir(), "lumem-legacy-origin-"));
    dirs.push(dir);
    const path = join(dir, "lumem.db");

    const sqlite = new Database(path);
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite, { schema }), { migrationsFolder: migrationsUpTo(1) });
    sqlite.prepare(`INSERT INTO workspace (id, name) VALUES ('w1', 'pessoal')`).run();
    sqlite
      .prepare(
        `INSERT INTO project (id, workspace_id, name, path, default_branch)
         VALUES ('p1', 'w1', 'lorebase', '/repos/lorebase', 'main')`,
      )
      .run();
    sqlite.close();

    return path;
  }

  it("dá as colunas novas a uma linha que já existia, com os defaults", async () => {
    const handle = openDatabase({ path: databaseBeforeOrigin() });
    open.push(handle);

    const [row] = await handle.db.select().from(schema.project);

    expect(row).toMatchObject({ id: "p1", name: "lorebase", path: "/repos/lorebase" });
    // A12: nada que veio do disco do usuário nasce gerenciado.
    expect(row?.remoteUrl).toBeNull();
    expect(row?.managed).toBe(false);
  });

  it("é idempotente — reabrir não migra de novo", async () => {
    const path = databaseBeforeOrigin();
    openDatabase({ path }).close();

    const second = openDatabase({ path });
    open.push(second);

    expect(await second.db.select().from(schema.project)).toHaveLength(1);
  });
});
