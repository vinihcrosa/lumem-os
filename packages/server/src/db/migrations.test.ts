import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS_DIR, openDatabase } from "./index.js";
import { schema } from "./schema.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

/**
 * A migrations folder holding only the first `count` migrations.
 *
 * The journal is what drizzle reads to decide what has run, so trimming it is
 * how a database from an older version of the schema gets built honestly —
 * applying the SQL by hand would leave the bookkeeping table empty and the next
 * `migrate` would try to create tables that already exist.
 */
function migrationsUpTo(count: number): string {
  const dir = tempDir("lumem-migrations-");
  mkdirSync(join(dir, "meta"), { recursive: true });

  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  const entries = journal.entries.slice(0, count);
  for (const entry of entries) {
    copyFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  }
  writeFileSync(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }, null, 2),
  );
  return dir;
}

describe("um banco de antes da migração", () => {
  it("abre, migra e não perde linha", () => {
    // O projeto ainda não está em produção, mas a regra que este teste guarda
    // não é sobre esta migração: é sobre qualquer uma depois dela.
    const dir = tempDir("lumem-old-db-");
    const path = join(dir, "lumem.db");

    const antigo = new Database(path);
    antigo.pragma("foreign_keys = ON");
    migrate(drizzle(antigo, { schema }), { migrationsFolder: migrationsUpTo(1) });
    antigo
      .prepare(
        "INSERT INTO workspace (id, name) VALUES ('w1', 'pessoal')",
      )
      .run();
    antigo
      .prepare(
        `INSERT INTO project (id, workspace_id, name, path, default_branch)
         VALUES ('p1', 'w1', 'lorebase', '/repos/lorebase', 'main')`,
      )
      .run();
    antigo.close();

    const { db, close } = openDatabase({ path });
    try {
      const row = db.select().from(schema.project).all()[0];

      expect(row).toMatchObject({ id: "p1", name: "lorebase", path: "/repos/lorebase" });
      // Os defaults das colunas novas, aplicados a uma linha que já existia.
      expect(row?.remoteUrl).toBeNull();
      expect(row?.managed).toBe(false);
    } finally {
      close();
    }
  });

  it("é idempotente: migrar de novo não faz nada", () => {
    const dir = tempDir("lumem-old-db-");
    const path = join(dir, "lumem.db");

    openDatabase({ path }).close();
    const segunda = openDatabase({ path });
    try {
      expect(segunda.db.select().from(schema.project).all()).toEqual([]);
    } finally {
      segunda.close();
    }
  });
});
