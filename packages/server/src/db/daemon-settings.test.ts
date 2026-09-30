import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type Database_ } from "./index.js";
import { daemonSettings } from "./schema.js";

/**
 * `daemon_settings` (`038`, door 3): uma linha, e um conjunto fechado de valores.
 *
 * As três recusas vêm do **banco** — por SQL cru, e não pelo repositório. O que a
 * `CHECK` promete é justamente que nenhum escritor futuro, com o cuidado que tiver,
 * consiga gravar a segunda linha ou um `auto_update` que nenhum leitor sabe ler.
 */

const open: Database_[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const handle of open.splice(0)) handle.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A frase do SQLite: o drizzle embrulha o erro dele em `Failed to run the query`. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    const inner = (error as { cause?: unknown }).cause ?? error;
    return inner instanceof Error ? inner.message : String(inner);
  }
  return "aceitou";
}

function migrated(): Database_ {
  const dir = mkdtempSync(join(tmpdir(), "lumem-daemon-settings-"));
  dirs.push(dir);
  const handle = openDatabase({ path: join(dir, "lumem.db") });
  open.push(handle);
  return handle;
}

describe("daemon_settings", () => {
  it("keeps one row and a closed set of values", () => {
    const { db } = migrated();

    // A migração cria a linha, com os padrões: nada precisa de *upsert*.
    expect(db.select().from(daemonSettings).all()).toEqual([
      { id: 1, updateCheck: 1, autoUpdate: "off" },
    ]);

    expect(refusal(() => db.run(sql`INSERT INTO daemon_settings (id) VALUES (2)`))).toContain(
      "CHECK constraint failed: daemon_settings_single_row",
    );
    expect(refusal(() => db.run(sql`UPDATE daemon_settings SET auto_update = 'sempre'`))).toContain(
      "CHECK constraint failed: daemon_settings_auto_update",
    );
    // O terceiro valor de um interruptor de dois: a mesma família do `'sempre'`.
    expect(refusal(() => db.run(sql`UPDATE daemon_settings SET update_check = 2`))).toContain(
      "CHECK constraint failed: daemon_settings_update_check",
    );

    // Nenhuma das três deixou rastro.
    expect(db.select().from(daemonSettings).all()).toEqual([
      { id: 1, updateCheck: 1, autoUpdate: "off" },
    ]);
  });

  it("does not make a second row when the database is opened again", () => {
    // O `INSERT` da migração roda uma vez por banco, e não a cada abertura: um
    // segundo boot com outra linha seria a `CHECK` recusando o próprio daemon.
    const dir = mkdtempSync(join(tmpdir(), "lumem-daemon-settings-"));
    dirs.push(dir);
    const path = join(dir, "lumem.db");
    openDatabase({ path }).close();
    const again = openDatabase({ path });
    open.push(again);
    again.db.run(sql`UPDATE daemon_settings SET auto_update = 'idle'`);
    again.close();
    open.pop();

    const raw = new Database(path, { readonly: true });
    try {
      expect(raw.prepare("SELECT id, auto_update FROM daemon_settings").all()).toEqual([
        { id: 1, auto_update: "idle" },
      ]);
    } finally {
      raw.close();
    }
  });
});
